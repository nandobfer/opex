import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Bootstrap da integração: token de bootstrap → app `opex` + token próprio gravado ANTES de revogar o
 * de bootstrap, e o webhook registrado. Repetir é seguro; falha depois da emissão não revoga nada.
 */

type Call = { method: string; path: string; body?: unknown; token: string }

const mocks = vi.hoisted(() => ({
  config: {} as Record<string, string | undefined>,
  calls: [] as { method: string; path: string; body?: unknown; token: string }[],
  apps: new Map<string, { slug: string; webhook: null | { url: string; secret: { configured: boolean; updated_at: string | null } } }>(),
  whoamiApp: 'bootstrap',
  failSave: false,
  audits: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: async () => ({ ...mocks.config }), getIntegration: async () => ({ values: { ...mocks.config }, secretSources: { adminToken: mocks.config.adminToken ? 'db' : 'none', webhookSecret: mocks.config.webhookSecret ? 'db' : 'none' }, secretErrors: [] }) }))
vi.mock('@/features/integrations/services/integration-service', () => ({
  IntegrationUpdateError: class extends Error {
    status = 400
  },
  updateIntegration: async (_id: string, input: { publicValues?: Record<string, string>; secrets?: Record<string, { action: string; value: string }> }) => {
    if (mocks.failSave && input.secrets?.adminToken) throw new Error('banco fora')
    Object.assign(mocks.config, input.publicValues ?? {})
    for (const [key, action] of Object.entries(input.secrets ?? {})) mocks.config[key] = action.value
  },
}))
vi.mock('@/features/engramind/server/shared', () => ({
  AcaoAuditoria: { EXECUTAR: 'EXECUTAR' },
  auditEngramind: async (_actor: string, _id: string, _acao: string, depois: Record<string, unknown>) => {
    mocks.audits.push(depois)
  },
  engramindLog: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  publishEngramind: vi.fn(),
}))
vi.mock('@/features/engramind/server/client', () => ({
  engramindTarget: async () => ({ baseUrl: mocks.config.baseUrl, token: mocks.config.adminToken }),
  engramindCall: async (method: string, request: { path: string; body?: Record<string, unknown> }, options: { target?: { token: string } } = {}) => {
    const token = options.target?.token ?? mocks.config.adminToken ?? ''
    mocks.calls.push({ method, path: request.path, body: request.body, token })
    if (request.path === '/v1/whoami') return { token_id: token.includes('novo') ? 'tk_novo0001' : 'tk_b0000001', kind: 'admin', scopes: ['read', 'write', 'delete'], app: { id: 'app_1', slug: token.includes('novo') ? 'opex' : mocks.whoamiApp }, agent: null, operations: [] }
    const appMatch = /^\/v1\/apps\/([^/]+)$/.exec(request.path)
    if (appMatch && method === 'GET') {
      const app = mocks.apps.get(appMatch[1]!)
      if (!app) {
        const { DomainError } = await import('@/lib/api/route')
        throw new DomainError(404, 'App não encontrado', 'ENGRAMIND_APP_NOT_FOUND')
      }
      return app
    }
    if (request.path === '/v1/apps' && method === 'POST') {
      const slug = String(request.body?.slug)
      mocks.apps.set(slug, { slug, webhook: null })
      return mocks.apps.get(slug)
    }
    if (appMatch && method === 'PATCH') {
      const app = mocks.apps.get(appMatch[1]!)!
      app.webhook = { url: String(request.body?.webhook_url), secret: { configured: true, updated_at: '2026-10-31T12:00:00Z' } }
      return app
    }
    if (request.path === '/v1/tokens' && method === 'POST') return { token: { id: 'tk_novo0001', prefix: 'eng.tk_novo0001' }, secret: `eng.tk_novo0001.${'n'.repeat(40)}` }
    if (/\/revoke$/.test(request.path)) return {}
    throw new Error(`rota inesperada ${method} ${request.path}`)
  },
}))

import { runBootstrap, saveConnection } from '@/features/engramind/server/bootstrap'

const BOOT = `eng.tk_b0000001.${'b'.repeat(40)}`
const order = (calls: Call[]) => calls.map((call) => `${call.method} ${call.path}`)

describe('bootstrap do Engramind', () => {
  beforeEach(() => {
    mocks.config = { baseUrl: 'http://engramind:8000', opexPublicUrl: 'http://opex:3100' }
    mocks.calls = []
    mocks.apps = new Map([['bootstrap', { slug: 'bootstrap', webhook: null }]])
    mocks.whoamiApp = 'bootstrap'
    mocks.failSave = false
    mocks.audits = []
  })

  it('com o token de bootstrap: cria o app opex, emite e grava o token próprio, só depois revoga o bootstrap e registra o webhook', async () => {
    const result = await saveConnection({ baseUrl: 'http://engramind:8000', opexPublicUrl: 'http://opex:3100', environmentId: null, adminToken: BOOT }, 'local')
    expect(result.steps.map((step) => `${step.id}:${step.status}`)).toEqual(['whoami:ok', 'app:ok', 'token:ok', 'save:ok', 'revoke:ok', 'webhook:ok'])
    expect(mocks.config.adminToken).toBe(`eng.tk_novo0001.${'n'.repeat(40)}`)
    const sequence = order(mocks.calls)
    expect(sequence.indexOf('POST /v1/tokens')).toBeLessThan(sequence.indexOf('POST /v1/tokens/tk_b0000001/revoke'))
    // O revoke sai com o token NOVO (o de bootstrap continua válido até lá).
    expect(mocks.calls.find((call) => call.path.endsWith('/revoke'))!.token).toContain('novo')
    const issue = mocks.calls.find((call) => call.method === 'POST' && call.path === '/v1/tokens')!
    expect(issue.body).toEqual({ kind: 'admin', app: 'opex', scopes: ['read', 'write', 'delete'], label: 'Opex' })
    const patch = mocks.calls.find((call) => call.method === 'PATCH')!
    expect(patch.path).toBe('/v1/apps/opex')
    expect((patch.body as { webhook_url: string }).webhook_url).toBe('http://opex:3100/api/engramind/webhook')
    expect((patch.body as { webhook_secret: string }).webhook_secret).toBe(mocks.config.webhookSecret)
    expect(Buffer.from(mocks.config.webhookSecret!, 'base64')).toHaveLength(48)
    expect(JSON.stringify(mocks.audits)).not.toContain(mocks.config.webhookSecret)
    expect(JSON.stringify(mocks.audits)).not.toContain('nnnnnnnn')
  })

  it('repetir reaproveita o app opex existente (não cria outro)', async () => {
    mocks.apps.set('opex', { slug: 'opex', webhook: null })
    mocks.config.adminToken = BOOT
    await runBootstrap('local')
    expect(mocks.calls.some((call) => call.method === 'POST' && call.path === '/v1/apps')).toBe(false)
  })

  it('falha ao gravar o token novo: o de bootstrap NÃO é revogado e o status avisa', async () => {
    mocks.failSave = true
    mocks.config.adminToken = BOOT
    const steps = await runBootstrap('local')
    expect(steps.at(-1)).toMatchObject({ id: 'save', status: 'failed' })
    expect(steps.at(-1)!.message).toContain('o de bootstrap continua válido')
    expect(mocks.calls.some((call) => call.path.endsWith('/revoke'))).toBe(false)
  })

  it('token próprio já em uso: só confere o webhook; trocar a URL pública atualiza o webhook', async () => {
    mocks.whoamiApp = 'opex'
    mocks.apps.set('opex', { slug: 'opex', webhook: { url: 'http://opex:3100/api/engramind/webhook', secret: { configured: true, updated_at: null } } })
    mocks.config.adminToken = `eng.tk_opex0001.${'o'.repeat(40)}`
    mocks.config.webhookSecret = 'x'.repeat(64)
    expect((await runBootstrap('local')).map((step) => `${step.id}:${step.status}`)).toEqual(['whoami:ok', 'webhook:skipped'])
    mocks.config.opexPublicUrl = 'https://opex.novo'
    const steps = await runBootstrap('local')
    expect(steps.at(-1)).toMatchObject({ id: 'webhook', status: 'ok' })
    expect(mocks.apps.get('opex')!.webhook!.url).toBe('https://opex.novo/api/engramind/webhook')
  })
})
