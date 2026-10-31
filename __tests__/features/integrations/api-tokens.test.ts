import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  recordAudit: vi.fn(),
  save: vi.fn(),
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn(),
  find: vi.fn(),
  created: [] as Record<string, unknown>[],
  publish: vi.fn(async () => {}),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publish }))
vi.mock('@/lib/logger', () => ({ loggerFor: () => ({ info: mocks.logInfo, warn: mocks.logWarn }) }))
vi.mock('@/features/integrations/api-tokens/scope-catalog', () => ({
  apiTokenScopeCatalog: async () => ({
    routes: [],
    groups: [{ id: 'tasks', label: 'Tarefas', description: '' }],
    tools: [{ name: 'list_tasks', group: 'tasks', label: 'Listar', description: '', risk: 'read', alwaysOn: false }],
  }),
}))
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
  updateApiTokenScopes,
} from '@/features/integrations/api-tokens/service'
import { apiTokenInputSchema } from '@/features/integrations/api-tokens/schemas'

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
    const result = await createApiToken('local', { nome: '  Script de relatórios ', escopos: ['api:v1:*', 'mcp:owner', 'mcp:owner:tool:list_tasks'] })

    expect(API_TOKEN_PREFIX).toBe('mt_sys_')
    expect(result.token.startsWith('mt_sys_')).toBe(true)
    expect(result.item).toMatchObject({ nome: 'Script de relatórios', prefixo: result.token.slice(0, 15), ultimoUsoEm: null })
    expect(mocks.save).toHaveBeenCalled()

    const doc = mocks.created[0]!
    expect(doc.hash).toBe(hashApiToken(result.token))
    expect(JSON.stringify(doc)).not.toContain(result.token)

    const audit = mocks.recordAudit.mock.calls[0][0]
    expect(audit).toMatchObject({ userId: 'local', acao: 'CRIAR', depois: { nome: 'Script de relatórios', prefixo: result.item.prefixo, escopos: ['api:v1:*', 'mcp:owner', 'mcp:owner:tool:list_tasks'], expiraEm: null } })
    expect(JSON.stringify(audit)).not.toContain(result.token)
    expect(doc.escopos).toEqual(['api:v1:*', 'mcp:owner', 'mcp:owner:tool:list_tasks'])
    expect(result.item).toMatchObject({ legado: false, escopos: ['api:v1:*', 'mcp:owner', 'mcp:owner:tool:list_tasks'], expirado: false })
    expect(mocks.publish).toHaveBeenCalledWith('api-tokens-updated', { id: '66f0c0ffee0000000000abcd' })
  })

  it('grava a expiração e recusa ferramenta fora do catálogo', async () => {
    const expiraEm = '2999-01-01T02:59:59.999Z'
    const result = await createApiToken('local', { nome: 'Exp', escopos: ['api:v1:*'], expiraEm })
    expect(result.item.expiraEm).toBe(expiraEm)
    await expect(createApiToken('local', { nome: 'X1', escopos: ['mcp:owner', 'mcp:owner:tool:nao_existe'] })).rejects.toMatchObject({ status: 400, code: 'API_TOKEN_SCOPE_UNKNOWN' })
    await expect(createApiToken('local', { nome: 'X2', escopos: ['mcp:owner', 'mcp:owner:group:files'] })).rejects.toMatchObject({ status: 400 })
  })

  it('o schema da API recusa token sem escopo e expiração no passado', () => {
    expect(apiTokenInputSchema.safeParse({ nome: 'Script', escopos: [] }).success).toBe(false)
    expect(apiTokenInputSchema.safeParse({ nome: 'Script' }).success).toBe(false)
    expect(apiTokenInputSchema.safeParse({ nome: 'Script', escopos: ['api:v1:*'], expiraEm: '2000-01-01T00:00:00.000Z' }).success).toBe(false)
    expect(apiTokenInputSchema.safeParse({ nome: 'Script', escopos: ['api:v1:*'] }).success).toBe(true)
  })

  it('cada token gerado é diferente', async () => {
    const a = await createApiToken('local', { nome: 'A1', escopos: ['api:v1:*'] })
    const b = await createApiToken('local', { nome: 'B1', escopos: ['api:v1:*'] })
    expect(a.token).not.toBe(b.token)
  })
})

describe('listApiTokens', () => {
  it('lista só prefixo e metadados, nunca o hash', async () => {
    mocks.find.mockResolvedValue([storedToken()])
    const items = await listApiTokens()
    expect(items).toEqual([
      { id: '66f0c0ffee0000000000abcd', nome: 'Script', prefixo: 'mt_sys_AbCdEfGh', criadoEm: '2026-01-01T00:00:00.000Z', ultimoUsoEm: null, escopos: [], legado: true, expiraEm: null, expirado: false },
    ])
    expect(JSON.stringify(items)).not.toContain('"hash"')
  })

  it('marca o token expirado (continua na lista até ser revogado)', async () => {
    mocks.find.mockResolvedValue([storedToken({ escopos: ['api:v1:*'], expiraEm: new Date('2020-01-01T00:00:00Z') })])
    const [item] = await listApiTokens()
    expect(item).toMatchObject({ legado: false, escopos: ['api:v1:*'], expiraEm: '2020-01-01T00:00:00.000Z', expirado: true })
  })
})

describe('updateApiTokenScopes', () => {
  it('troca os escopos e a expiração, audita antes/depois e avisa em tempo real', async () => {
    mocks.findOneAndUpdate.mockResolvedValue(storedToken())
    const item = await updateApiTokenScopes('local', '66f0c0ffee0000000000abcd', { escopos: ['mcp:owner', 'mcp:owner:group:tasks'], expiraEm: null })
    expect(item).toMatchObject({ escopos: ['mcp:owner', 'mcp:owner:group:tasks'], legado: false })
    const audit = mocks.recordAudit.mock.calls[0][0]
    expect(audit).toMatchObject({
      acao: 'ATUALIZAR',
      antes: { nome: 'Script', prefixo: 'mt_sys_AbCdEfGh', escopos: [], legado: true, expiraEm: null },
      depois: { escopos: ['mcp:owner', 'mcp:owner:group:tasks'], expiraEm: null },
    })
    expect(mocks.publish).toHaveBeenCalledWith('api-tokens-updated', { id: '66f0c0ffee0000000000abcd' })
  })

  it('token inexistente ou revogado responde 404 sem auditar', async () => {
    mocks.findOneAndUpdate.mockResolvedValue(null)
    await expect(updateApiTokenScopes('local', '66f0c0ffee0000000000abcd', { escopos: ['api:v1:*'] })).rejects.toMatchObject({ status: 404 })
    await expect(updateApiTokenScopes('local', 'xyz', { escopos: ['api:v1:*'] })).rejects.toMatchObject({ status: 404 })
    expect(mocks.recordAudit).not.toHaveBeenCalled()
  })
})

describe('revokeApiToken', () => {
  it('revoga e audita', async () => {
    mocks.findOneAndUpdate.mockResolvedValue(storedToken())
    await revokeApiToken('local', '66f0c0ffee0000000000abcd')
    expect(mocks.recordAudit.mock.calls[0][0]).toMatchObject({ acao: 'EXCLUIR', antes: { nome: 'Script', prefixo: 'mt_sys_AbCdEfGh', escopos: [] } })
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

  it('token expirado é recusado (401) como um revogado', async () => {
    const now = new Date('2026-06-01T00:00:00Z')
    mocks.findOne.mockResolvedValue(storedToken({ escopos: ['api:v1:*'], expiraEm: new Date('2026-05-31T23:59:59Z') }))
    expect(await authenticateApiToken('Bearer mt_sys_expirado', now)).toBeNull()
    expect(mocks.updateOne).not.toHaveBeenCalled()
    mocks.findOne.mockResolvedValue(storedToken({ escopos: ['api:v1:*'], expiraEm: new Date('2026-06-02T00:00:00Z') }))
    expect(await authenticateApiToken('Bearer mt_sys_valendo', now)).not.toBeNull()
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

  it('403 INSUFFICIENT_SCOPE sem o escopo da rota, com log sem o valor do token', async () => {
    mocks.findOne.mockResolvedValue(storedToken({ escopos: ['mcp:owner', 'mcp:owner:tool:*'] }))
    const request = new Request('http://localhost/api/v1/relatorios', { headers: { authorization: 'Bearer mt_sys_segredo123' } })
    const error = (await requireApiToken(request, { scope: 'api:v1:relatorios' }).catch((e: unknown) => e)) as DomainError
    expect(error.status).toBe(403)
    expect(error.code).toBe('INSUFFICIENT_SCOPE')
    expect(error.details).toEqual({ required: 'api:v1:relatorios' })
    const logged = JSON.stringify(mocks.logWarn.mock.calls)
    expect(logged).toContain('mt_sys_AbCdEfGh')
    expect(logged).toContain('api:v1:relatorios')
    expect(logged).not.toContain('segredo123')
  })

  it('com o escopo (ou api:v1:*) passa; rota livre aceita qualquer token, inclusive legado e só de MCP', async () => {
    const request = () => new Request('http://localhost/api/v1/x', { headers: { authorization: 'Bearer mt_sys_ok' } })
    mocks.findOne.mockResolvedValue(storedToken({ escopos: ['api:v1:relatorios'] }))
    expect((await requireApiToken(request(), { scope: 'api:v1:relatorios' })).nome).toBe('Script')
    mocks.findOne.mockResolvedValue(storedToken({ escopos: ['api:v1:*'] }))
    expect((await requireApiToken(request(), { scope: 'api:v1:relatorios' })).nome).toBe('Script')
    mocks.findOne.mockResolvedValue(storedToken())
    expect((await requireApiToken(request(), { scope: null })).legado).toBe(true)
    await expect(requireApiToken(request(), { scope: 'api:v1:relatorios' })).rejects.toMatchObject({ status: 403 })
    mocks.findOne.mockResolvedValue(storedToken({ escopos: ['mcp:owner'] }))
    expect((await requireApiToken(request())).escopos).toEqual(['mcp:owner'])
  })

  it('devolve o token quando válido', async () => {
    mocks.findOne.mockResolvedValue(storedToken())
    const token = await requireApiToken(new Request('http://localhost/api/v1/whoami', { headers: { authorization: 'Bearer mt_sys_ok' } }))
    expect(token.nome).toBe('Script')
  })
})
