import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  listIntegrations: vi.fn(),
  getIntegrationDetail: vi.fn(),
  updateIntegration: vi.fn(),
  listIntegrationLogs: vi.fn(),
  runIntegrationTest: vi.fn(),
  listApiTokens: vi.fn(),
  createApiToken: vi.fn(),
  revokeApiToken: vi.fn(),
  updateApiTokenScopes: vi.fn(),
  requireApiToken: vi.fn(),
  apiTokenScopeCatalog: vi.fn(),
}))

vi.mock('@/features/integrations/services/integration-service', async () => {
  const actual = await vi.importActual<typeof import('@/features/integrations/services/integration-service')>(
    '@/features/integrations/services/integration-service',
  )
  return {
    IntegrationUpdateError: actual.IntegrationUpdateError,
    listIntegrations: mocks.listIntegrations,
    getIntegrationDetail: mocks.getIntegrationDetail,
    updateIntegration: mocks.updateIntegration,
    listIntegrationLogs: mocks.listIntegrationLogs,
  }
})
vi.mock('@/features/integrations/services/integration-test-runner', () => ({ runIntegrationTest: mocks.runIntegrationTest }))
vi.mock('@/features/integrations/api-tokens/service', () => ({
  listApiTokens: mocks.listApiTokens,
  createApiToken: mocks.createApiToken,
  revokeApiToken: mocks.revokeApiToken,
  updateApiTokenScopes: mocks.updateApiTokenScopes,
  requireApiToken: mocks.requireApiToken,
}))
vi.mock('@/features/integrations/api-tokens/scope-catalog', () => ({ apiTokenScopeCatalog: mocks.apiTokenScopeCatalog }))
vi.mock('@/lib/logger', () => ({ logApiError: vi.fn(), logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { GET as listGET } from '@/app/api/integrations/route'
import { GET as detailGET, PATCH } from '@/app/api/integrations/[id]/route'
import { POST as testPOST } from '@/app/api/integrations/[id]/test/route'
import { GET as logsGET } from '@/app/api/integrations/[id]/logs/route'
import { GET as tokensGET, POST as tokensPOST } from '@/app/api/integrations/internal_api/tokens/route'
import { DELETE as tokenDELETE, PATCH as tokenPATCH } from '@/app/api/integrations/internal_api/tokens/[tokenId]/route'
import { GET as scopesGET } from '@/app/api/integrations/internal_api/scopes/route'
import { GET as whoamiGET } from '@/app/api/v1/whoami/route'
import { IntegrationUpdateError } from '@/features/integrations/services/integration-service'
import { DomainError } from '@/lib/api/route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/integrations', () => {
  it('lista todas as integrações', async () => {
    mocks.listIntegrations.mockResolvedValue([{ id: 'pusher' }, { id: 'crons' }])
    const res = await listGET()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.map((i: { id: string }) => i.id)).toEqual(['pusher', 'crons'])
    expect(mocks.listIntegrations).toHaveBeenCalledWith()
  })

  it('falha inesperada vira 500 em pt-BR', async () => {
    mocks.listIntegrations.mockRejectedValue(new Error('mongo down'))
    const res = await listGET()
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('Erro ao listar integrações')
  })
})

describe('GET/PATCH /api/integrations/[id]', () => {
  it('404 para integração desconhecida', async () => {
    expect((await detailGET(new NextRequest('http://x'), params('meta'))).status).toBe(404)
    expect((await detailGET(new NextRequest('http://x'), params('google_drive'))).status).toBe(404)
    expect((await detailGET(new NextRequest('http://x'), params('archflow'))).status).toBe(404)
  })

  it('GET devolve o detalhe da integração', async () => {
    mocks.getIntegrationDetail.mockResolvedValue({ id: 'pusher' })
    const res = await detailGET(new NextRequest('http://x'), params('pusher'))
    expect(res.status).toBe(200)
    expect(mocks.getIntegrationDetail).toHaveBeenCalledWith('pusher')
  })

  it('PATCH valida o payload', async () => {
    const bad = await PATCH(
      new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify({ publicValues: { internalBaseUrl: 'nao-e-url' } }) }),
      params('crons'),
    )
    expect(bad.status).toBe(400)
    expect(mocks.updateIntegration).not.toHaveBeenCalled()
  })

  it('PATCH salva com o usuário local e devolve o detalhe', async () => {
    mocks.updateIntegration.mockResolvedValue({ id: 'pusher' })
    const res = await PATCH(
      new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify({ publicValues: { appId: '123' }, debugMode: true }) }),
      params('pusher'),
    )
    expect(res.status).toBe(200)
    expect((await res.json()).message).toBe('Integração salva')
    expect(mocks.updateIntegration).toHaveBeenCalledWith('pusher', { publicValues: { appId: '123' }, debugMode: true }, 'local')
  })

  it('PATCH aceita a documentação Swagger e recusa URL que não é http(s)', async () => {
    mocks.updateIntegration.mockResolvedValue({ id: 'pusher' })
    const ok = await PATCH(
      new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify({ swaggerUrl: 'https://api.exemplo.com/openapi.json' }) }),
      params('pusher'),
    )
    expect(ok.status).toBe(200)
    expect(mocks.updateIntegration).toHaveBeenCalledWith('pusher', { swaggerUrl: 'https://api.exemplo.com/openapi.json' }, 'local')

    const bad = await PATCH(
      new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify({ swaggerUrl: 'ftp://arquivo' }) }),
      params('pusher'),
    )
    expect(bad.status).toBe(400)
  })

  it('PATCH traduz o erro de chave de criptografia ausente em 409', async () => {
    mocks.updateIntegration.mockRejectedValue(new IntegrationUpdateError('Configure INTEGRATIONS_ENCRYPTION_KEY', 409))
    const res = await PATCH(
      new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify({ secrets: { secret: { action: 'set', value: 'x' } } }) }),
      params('pusher'),
    )
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/INTEGRATIONS_ENCRYPTION_KEY/)
  })
})

describe('POST /api/integrations/[id]/test', () => {
  it('transmite os eventos em NDJSON e termina com o resultado', async () => {
    mocks.runIntegrationTest.mockImplementation(async (_id, options: { emit: (l: string, m: string) => void }) => {
      options.emit('step', 'Conectando')
      options.emit('success', 'Conectado')
      return { ok: true, latencyMs: 12, message: 'Pusher pronto' }
    })

    const res = await testPOST(new NextRequest('http://x', { method: 'POST' }), params('pusher'))
    expect(res.headers.get('content-type')).toContain('application/x-ndjson')
    const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l))
    expect(lines.map((l) => l.type)).toEqual(['log', 'log', 'result'])
    expect(lines[0]).toMatchObject({ level: 'step', message: 'Conectando' })
    expect(lines[2]).toMatchObject({ ok: true, message: 'Pusher pronto' })
  })

  it('integração desconhecida não executa o teste', async () => {
    const res = await testPOST(new NextRequest('http://x', { method: 'POST' }), params('linx'))
    expect(res.status).toBe(404)
    expect(mocks.runIntegrationTest).not.toHaveBeenCalled()
  })
})

describe('GET /api/integrations/[id]/logs', () => {
  it('repassa o cursor "after" e o limite', async () => {
    mocks.listIntegrationLogs.mockResolvedValue([])
    const res = await logsGET(new NextRequest('http://x/logs?after=2026-09-22T10:00:00.000Z&limit=50'), params('pusher'))
    expect(res.status).toBe(200)
    expect(mocks.listIntegrationLogs).toHaveBeenCalledWith('pusher', { after: new Date('2026-09-22T10:00:00.000Z'), limit: 50 })
  })
})

describe('tokens de sistema da API interna', () => {
  const noParams = { params: Promise.resolve({}) } as never

  it('GET lista os tokens ativos', async () => {
    mocks.listApiTokens.mockResolvedValue([{ id: 't1', prefixo: 'mt_sys_AbCdEfGh' }])
    const res = await tokensGET(new NextRequest('http://x'), noParams)
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual([{ id: 't1', prefixo: 'mt_sys_AbCdEfGh' }])
  })

  it('POST valida o nome e os escopos e gera o token com o usuário local', async () => {
    const bad = await tokensPOST(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ nome: 'a', escopos: ['api:v1:*'] }) }), noParams)
    expect(bad.status).toBe(400)
    const noScope = await tokensPOST(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ nome: 'Script', escopos: [] }) }), noParams)
    expect(noScope.status).toBe(400)
    const toolWithoutMcp = await tokensPOST(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ nome: 'Script', escopos: ['mcp:owner:tool:list_tasks'] }) }), noParams)
    expect(toolWithoutMcp.status).toBe(400)
    expect(mocks.createApiToken).not.toHaveBeenCalled()

    mocks.createApiToken.mockResolvedValue({ token: 'mt_sys_x', item: { id: 't1' } })
    const res = await tokensPOST(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ nome: 'Script', escopos: ['api:v1:*'] }) }), noParams)
    expect(res.status).toBe(201)
    expect(mocks.createApiToken).toHaveBeenCalledWith('local', { nome: 'Script', escopos: ['api:v1:*'] })
  })

  it('PATCH edita os escopos com o usuário local; sem escopo responde 400', async () => {
    const params = { params: Promise.resolve({ tokenId: 't1' }) }
    const bad = await tokenPATCH(new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify({ escopos: [] }) }), params)
    expect(bad.status).toBe(400)
    expect(mocks.updateApiTokenScopes).not.toHaveBeenCalled()
    mocks.updateApiTokenScopes.mockResolvedValue({ id: 't1', escopos: ['mcp:owner'] })
    const res = await tokenPATCH(new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify({ escopos: ['mcp:owner'], expiraEm: null }) }), params)
    expect(res.status).toBe(200)
    expect(mocks.updateApiTokenScopes).toHaveBeenCalledWith('local', 't1', { escopos: ['mcp:owner'], expiraEm: null })
  })

  it('GET scopes devolve o catálogo de escopos', async () => {
    mocks.apiTokenScopeCatalog.mockResolvedValue({ routes: [], groups: [], tools: [] })
    const res = await scopesGET(new NextRequest('http://x'), noParams)
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({ routes: [], groups: [], tools: [] })
  })

  it('DELETE revoga; token inexistente responde 404', async () => {
    mocks.revokeApiToken.mockResolvedValueOnce(undefined)
    const ok = await tokenDELETE(new NextRequest('http://x', { method: 'DELETE' }), { params: Promise.resolve({ tokenId: 't1' }) })
    expect(ok.status).toBe(200)
    expect(mocks.revokeApiToken).toHaveBeenCalledWith('local', 't1')

    mocks.revokeApiToken.mockRejectedValueOnce(new DomainError(404, 'Token não encontrado'))
    const missing = await tokenDELETE(new NextRequest('http://x', { method: 'DELETE' }), { params: Promise.resolve({ tokenId: 'x' }) })
    expect(missing.status).toBe(404)
  })
})

describe('GET /api/v1/whoami', () => {
  it('responde o token usado na chamada', async () => {
    mocks.requireApiToken.mockResolvedValue({ id: 't1', nome: 'Script', prefixo: 'mt_sys_AbCdEfGh', criadoEm: '', ultimoUsoEm: null, escopos: ['mcp:owner'], legado: false, expiraEm: null, expirado: false })
    const res = await whoamiGET(new NextRequest('http://x/api/v1/whoami'), { params: Promise.resolve({}) } as never)
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({ token: { id: 't1', nome: 'Script', prefixo: 'mt_sys_AbCdEfGh', escopos: ['mcp:owner'], legado: false, expiraEm: null } })
    // whoami é livre: exige só um token válido (escopo null), inclusive o só de MCP.
    expect(mocks.requireApiToken.mock.calls[0][1]).toEqual({ scope: null })
  })

  it('401 sem token válido', async () => {
    mocks.requireApiToken.mockRejectedValue(new DomainError(401, 'Token ausente, inválido ou revogado', 'UNAUTHENTICATED'))
    const res = await whoamiGET(new NextRequest('http://x/api/v1/whoami'), { params: Promise.resolve({}) } as never)
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('UNAUTHENTICATED')
  })
})
