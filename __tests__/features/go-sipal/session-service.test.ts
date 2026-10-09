import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomBytes } from 'crypto'

type Doc = { integrationId: string; environment: string; debugMode: boolean; publicValues: Record<string, unknown>; secretValues: Record<string, unknown> }

const mocks = vi.hoisted(() => ({
  state: { doc: null as Doc | null },
  recordAudit: vi.fn(),
  publish: vi.fn(),
  runTest: vi.fn(),
}))

vi.mock('@/lib/integrations/store', () => ({
  INTEGRATION_CACHE_TTL_MS: 30_000,
  loadStoredIntegrations: vi.fn(async () => new Map(mocks.state.doc ? [[mocks.state.doc.integrationId, mocks.state.doc]] : [])),
  loadStoredIntegration: vi.fn(async (id: string) => (mocks.state.doc?.integrationId === id ? mocks.state.doc : null)),
  invalidateStoredIntegrations: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
  dbConnect: vi.fn(),
  recordAudit: mocks.recordAudit,
  AcaoAuditoria: { LOGIN: 'LOGIN', LOGOUT: 'LOGOUT', EXECUTAR: 'EXECUTAR', CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR' },
  createAuditContext: (userId: string) => ({ userId }),
}))
vi.mock('@/lib/db/models/Integration', () => {
  function Integration(this: Record<string, unknown>, data: Doc) {
    this.set = vi.fn()
    this.save = async () => {
      mocks.state.doc = { ...data, publicValues: {}, secretValues: {} }
    }
  }
  ;(Integration as unknown as { updateOne: unknown }).updateOne = vi.fn(async (_filter: unknown, update: { $set?: Record<string, unknown>; $unset?: Record<string, unknown> }) => {
    const doc = mocks.state.doc!
    for (const [path, value] of Object.entries(update.$set ?? {})) {
      const [root, key] = path.split('.') as ['publicValues' | 'secretValues', string]
      doc[root][key] = value
    }
    for (const path of Object.keys(update.$unset ?? {})) {
      const [root, key] = path.split('.') as ['publicValues' | 'secretValues', string]
      delete doc[root][key]
    }
  })
  return { Integration }
})
vi.mock('@/lib/pusher/channels', () => ({ publishToChannels: mocks.publish }))
vi.mock('@/features/integrations/services/integration-test-runner', () => ({ runIntegrationTest: mocks.runTest }))

import { decryptSecret, isEncryptedSecret, type EncryptedSecret } from '@/lib/crypto/secretBox'
import { DomainError } from '@/lib/api/route'
import {
  disconnectGoSipal,
  getGoSipalSession,
  sendGoSipalCode,
  sessionStatusOf,
  verifyGoSipalCode,
} from '@/features/go-sipal/session/service'
import { INTEGRATION_TESTERS } from '@/features/integrations/testers/testers'

const DAY = 86_400_000
const NOW = new Date('2026-10-08T12:00:00Z').getTime()
const jwt = (exp: number) =>
  `h.${Buffer.from(JSON.stringify({ userId: 'u1', email: 'fer@sipal.com.br', exp: Math.floor(exp / 1000) })).toString('base64url')}.sig`

const fetchMock = vi.fn()
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const withEmail = () => {
  mocks.state.doc = {
    integrationId: 'go_sipal',
    environment: 'externo',
    debugMode: false,
    publicValues: { email: 'fer@sipal.com.br' },
    secretValues: {},
  }
}

const saved = { ...process.env }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.doc = null
  process.env.INTEGRATIONS_ENCRYPTION_KEY = randomBytes(32).toString('base64')
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  process.env = { ...saved }
  vi.unstubAllGlobals()
})

describe('sessionStatusOf', () => {
  it('sem token, válido, perto de expirar e expirado', () => {
    expect(sessionStatusOf(undefined, 3, NOW).status).toBe('disconnected')
    expect(sessionStatusOf(jwt(NOW + 28 * DAY), 3, NOW)).toMatchObject({ status: 'connected', daysLeft: 28 })
    expect(sessionStatusOf(jwt(NOW + 2.5 * DAY), 3, NOW)).toMatchObject({ status: 'expiring', daysLeft: 3 })
    expect(sessionStatusOf(jwt(NOW - 1000), 3, NOW)).toMatchObject({ status: 'expired', daysLeft: 0 })
    expect(sessionStatusOf('nao-e-jwt', 3, NOW)).toMatchObject({ status: 'connected', expiresAt: null })
  })
})

describe('enviar código', () => {
  it('sem e-mail salvo recusa sem chamar a plataforma', async () => {
    await expect(sendGoSipalCode('local', NOW)).rejects.toMatchObject({ status: 409 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('pede o código para o e-mail salvo e guarda o login pendente; reenviar exige 60 s', async () => {
    withEmail()
    fetchMock.mockResolvedValue(json({ message: 'Código enviado com sucesso' }))
    const session = await sendGoSipalCode('local', NOW)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://go.sipal.com.br/api/auth/send-code')
    expect(JSON.parse(init.body)).toEqual({ email: 'fer@sipal.com.br' })
    expect(init.headers.Authorization).toBeUndefined()
    expect(session.pending).toMatchObject({ email: 'fer@sipal.com.br', expired: false })
    expect(session.pending?.codeExpiresAt).toBe(new Date(NOW + 15 * 60_000).toISOString())
    expect(mocks.publish).toHaveBeenCalledWith(['private-integration-go_sipal'], 'session-updated', {})

    await expect(sendGoSipalCode('local', NOW + 30_000)).rejects.toMatchObject({ status: 429 })
    await sendGoSipalCode('local', NOW + 61_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('domínio não autorizado: repassa a mensagem da plataforma (403)', async () => {
    withEmail()
    fetchMock.mockResolvedValue(json({ error: 'Domínio não autorizado para acesso' }, 403))
    const error = await sendGoSipalCode('local', NOW).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(DomainError)
    expect(error).toMatchObject({ status: 403, message: 'Domínio não autorizado para acesso' })
    expect((await getGoSipalSession(NOW)).pending).toBeNull()
  })
})

describe('confirmar código', () => {
  it('sem código pendente ou com código expirado recusa', async () => {
    withEmail()
    await expect(verifyGoSipalCode('123456', 'local', NOW)).rejects.toMatchObject({ status: 409 })
    fetchMock.mockResolvedValue(json({}))
    await sendGoSipalCode('local', NOW)
    await expect(verifyGoSipalCode('123456', 'local', NOW + 16 * 60_000)).rejects.toMatchObject({ status: 400 })
  })

  it('guarda o JWT cifrado e os dados do usuário; auditoria sem o token', async () => {
    withEmail()
    fetchMock.mockResolvedValueOnce(json({}))
    await sendGoSipalCode('local', NOW)
    const token = jwt(NOW + 28 * DAY)
    fetchMock.mockResolvedValueOnce(
      json({ token, user: { name: 'Fernando', email: 'fer@sipal.com.br', userType: 'operador', isDeveloper: true, isDevLeader: false } }),
    )

    const session = await verifyGoSipalCode('123456', 'local', NOW + 60_000)
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ email: 'fer@sipal.com.br', code: '123456' })

    const box = mocks.state.doc!.secretValues.token as EncryptedSecret
    expect(isEncryptedSecret(box)).toBe(true)
    expect(decryptSecret(box)).toBe(token)
    expect(session).toMatchObject({
      status: 'connected',
      daysLeft: 28,
      pending: null,
      user: { name: 'Fernando', userType: 'operador', isDeveloper: true },
    })
    expect(JSON.stringify(mocks.recordAudit.mock.calls)).not.toContain(token)
    expect(mocks.recordAudit).toHaveBeenLastCalledWith(expect.objectContaining({ acao: 'LOGIN', entidadeId: 'go_sipal' }))
    await vi.waitFor(() => expect(mocks.runTest).toHaveBeenCalledWith('go_sipal', { source: 'manual' }))
  })

  it('código inválido: mensagem da plataforma e o login continua pendente', async () => {
    withEmail()
    fetchMock.mockResolvedValueOnce(json({}))
    await sendGoSipalCode('local', NOW)
    fetchMock.mockResolvedValueOnce(json({ error: 'Código inválido' }, 400))
    await expect(verifyGoSipalCode('000000', 'local', NOW)).rejects.toMatchObject({ status: 400, message: 'Código inválido' })
    expect((await getGoSipalSession(NOW)).pending).not.toBeNull()
  })
})

describe('desconectar e teste de conexão', () => {
  const connect = async (exp: number, user: Record<string, unknown>) => {
    withEmail()
    fetchMock.mockResolvedValueOnce(json({}))
    await sendGoSipalCode('local', Date.now())
    fetchMock.mockResolvedValueOnce(json({ token: jwt(exp), user }))
    await verifyGoSipalCode('123456', 'local', Date.now())
  }
  const ctx = () => ({ emit: vi.fn(), signal: new AbortController().signal })

  it('desconectar apaga o token e os dados da sessão', async () => {
    await connect(Date.now() + 28 * DAY, { name: 'Fernando', isDeveloper: true })
    const session = await disconnectGoSipal('local')
    expect(session).toMatchObject({ status: 'disconnected', user: null })
    expect(mocks.state.doc!.secretValues.token).toBeNull()
    expect(mocks.recordAudit).toHaveBeenLastCalledWith(expect.objectContaining({ acao: 'LOGOUT' }))
  })

  it('teste: sem sessão falha; desenvolvedor com sessão longa fica verde', async () => {
    await expect(INTEGRATION_TESTERS.go_sipal(ctx())).rejects.toThrow(/Sem sessão/)
    await connect(Date.now() + 28 * DAY, { name: 'Fernando', isDeveloper: true })
    fetchMock.mockResolvedValueOnce(json({ user: { name: 'Fernando', userType: 'operador', isDeveloper: true } }))
    await expect(INTEGRATION_TESTERS.go_sipal(ctx())).resolves.toBe('Sessão do Go! Sipal ativa')
    expect(fetchMock.mock.calls.at(-1)![1].headers.Authorization).toMatch(/^Bearer h\./)
  })

  it('teste: amarelo perto de expirar ou sem perfil de desenvolvedor; vermelho com 401', async () => {
    await connect(Date.now() + 2 * DAY, { name: 'Fernando', isDeveloper: false })
    fetchMock.mockResolvedValueOnce(json({ user: { name: 'Fernando', isDeveloper: false } }))
    const result = await INTEGRATION_TESTERS.go_sipal(ctx())
    expect(result).toMatchObject({ status: 'warn' })
    expect((result as { message: string }).message).toMatch(/não é desenvolvedor.*expira em 2 dia/)

    fetchMock.mockResolvedValueOnce(json({ error: 'Token inválido ou expirado' }, 401))
    await expect(INTEGRATION_TESTERS.go_sipal(ctx())).rejects.toThrow(/expirada ou inválida/)
  })
})
