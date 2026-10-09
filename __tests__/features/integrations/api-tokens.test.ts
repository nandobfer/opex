import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  recordAudit: vi.fn(),
  save: vi.fn(),
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn(),
  find: vi.fn(),
  created: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/lib/audit/record', () => ({ recordAudit: mocks.recordAudit }))
vi.mock('@/lib/db/plugins/audit.plugin', () => ({ createAuditContext: (userId: string) => ({ userId }) }))
vi.mock('@/lib/db/models/ApiToken', () => {
  function ApiToken(this: Record<string, unknown>, data: Record<string, unknown>) {
    Object.assign(this, data, { _id: '66f0c0ffee0000000000abcd', createdAt: new Date('2026-01-01T00:00:00Z') })
    this.set = vi.fn()
    this.save = mocks.save
    this.toObject = () => ({ ...this })
    mocks.created.push(this)
  }
  Object.assign(ApiToken, {
    find: () => ({ sort: () => ({ lean: mocks.find }) }),
    findOne: () => ({ lean: mocks.findOne }),
    findOneAndUpdate: () => ({ lean: mocks.findOneAndUpdate }),
    updateOne: mocks.updateOne,
  })
  return { ApiToken }
})

import { DomainError } from '@/lib/api/route'
import {
  API_TOKEN_PREFIX,
  authenticateApiToken,
  createApiToken,
  hashApiToken,
  listApiTokens,
  requireApiToken,
  revokeApiToken,
} from '@/features/integrations/api-tokens/service'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.created.length = 0
})

const storedToken = (over: Record<string, unknown> = {}) => ({
  _id: '66f0c0ffee0000000000abcd',
  nome: 'Script',
  prefixo: 'mt_sys_AbCdEfGh',
  hash: 'h',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ultimoUsoEm: null,
  ...over,
})

describe('createApiToken', () => {
  it('devolve o token com o prefixo mt_sys_ uma única vez e grava só o hash', async () => {
    const result = await createApiToken('local', { nome: '  Script de relatórios ' })

    expect(API_TOKEN_PREFIX).toBe('mt_sys_')
    expect(result.token.startsWith('mt_sys_')).toBe(true)
    expect(result.item).toMatchObject({ nome: 'Script de relatórios', prefixo: result.token.slice(0, 15), ultimoUsoEm: null })
    expect(mocks.save).toHaveBeenCalled()

    const doc = mocks.created[0]!
    expect(doc.hash).toBe(hashApiToken(result.token))
    expect(JSON.stringify(doc)).not.toContain(result.token)

    const audit = mocks.recordAudit.mock.calls[0][0]
    expect(audit).toMatchObject({ userId: 'local', acao: 'CRIAR', depois: { nome: 'Script de relatórios', prefixo: result.item.prefixo } })
    expect(JSON.stringify(audit)).not.toContain(result.token)
  })

  it('cada token gerado é diferente', async () => {
    const a = await createApiToken('local', { nome: 'A1' })
    const b = await createApiToken('local', { nome: 'B1' })
    expect(a.token).not.toBe(b.token)
  })
})

describe('listApiTokens', () => {
  it('lista só prefixo e metadados, nunca o hash', async () => {
    mocks.find.mockResolvedValue([storedToken()])
    const items = await listApiTokens()
    expect(items).toEqual([{ id: '66f0c0ffee0000000000abcd', nome: 'Script', prefixo: 'mt_sys_AbCdEfGh', criadoEm: '2026-01-01T00:00:00.000Z', ultimoUsoEm: null }])
  })
})

describe('revokeApiToken', () => {
  it('revoga e audita', async () => {
    mocks.findOneAndUpdate.mockResolvedValue(storedToken())
    await revokeApiToken('local', '66f0c0ffee0000000000abcd')
    expect(mocks.recordAudit.mock.calls[0][0]).toMatchObject({ acao: 'EXCLUIR', antes: { nome: 'Script', prefixo: 'mt_sys_AbCdEfGh' } })
  })

  it('id inválido ou já revogado responde 404', async () => {
    await expect(revokeApiToken('local', 'xyz')).rejects.toMatchObject({ status: 404 })
    mocks.findOneAndUpdate.mockResolvedValue(null)
    await expect(revokeApiToken('local', '66f0c0ffee0000000000abcd')).rejects.toMatchObject({ status: 404 })
    expect(mocks.recordAudit).not.toHaveBeenCalled()
  })
})

describe('authenticateApiToken', () => {
  it('token válido é aceito e atualiza o último uso', async () => {
    mocks.findOne.mockResolvedValue(storedToken())
    const token = await authenticateApiToken('Bearer mt_sys_valido')
    expect(token?.prefixo).toBe('mt_sys_AbCdEfGh')
    expect(mocks.updateOne).toHaveBeenCalled()
  })

  it('não regrava o último uso dentro de 5 minutos', async () => {
    const now = new Date('2026-01-01T10:00:00Z')
    mocks.findOne.mockResolvedValue(storedToken({ ultimoUsoEm: new Date('2026-01-01T09:58:00Z') }))
    await authenticateApiToken('Bearer mt_sys_valido', now)
    expect(mocks.updateOne).not.toHaveBeenCalled()
  })

  it('token revogado ou inexistente é recusado', async () => {
    mocks.findOne.mockResolvedValue(null)
    expect(await authenticateApiToken('Bearer mt_sys_revogado')).toBeNull()
  })

  it('sem Bearer ou com prefixo errado nem consulta o banco', async () => {
    expect(await authenticateApiToken(null)).toBeNull()
    expect(await authenticateApiToken('mt_sys_semBearer')).toBeNull()
    expect(await authenticateApiToken('Bearer sd_sys_outro')).toBeNull()
    expect(mocks.findOne).not.toHaveBeenCalled()
  })
})

describe('requireApiToken', () => {
  it('401 sem token válido', async () => {
    mocks.findOne.mockResolvedValue(null)
    const error = await requireApiToken(new Request('http://localhost/api/v1/whoami', { headers: { authorization: 'Bearer mt_sys_x' } })).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(DomainError)
    expect((error as DomainError).status).toBe(401)
    expect((error as DomainError).code).toBe('UNAUTHENTICATED')

    await expect(requireApiToken(new Request('http://localhost/api/v1/whoami'))).rejects.toMatchObject({ status: 401 })
  })

  it('devolve o token quando válido', async () => {
    mocks.findOne.mockResolvedValue(storedToken())
    const token = await requireApiToken(new Request('http://localhost/api/v1/whoami', { headers: { authorization: 'Bearer mt_sys_ok' } }))
    expect(token.nome).toBe('Script')
  })
})
