import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Teste de conexão: verde, amarelo (bootstrap, webhook, entregas falhas, backup) e vermelho. */

const mocks = vi.hoisted(() => ({
  config: {} as Record<string, string | undefined>,
  ready: { ready: true, detail: 'ready' },
  whoami: null as unknown,
  whoamiError: null as unknown,
  app: null as unknown,
  failedJobs: [] as unknown[],
  status: { version: '0.8.0', backup: { status: 'ok', detail: null }, embedding: { state: 'ready' } } as Record<string, unknown>,
}))

vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: async () => mocks.config }))
vi.mock('@/features/engramind/server/client', () => ({
  engramindReady: async () => mocks.ready,
  engramindCall: async (_method: string, request: { path: string }) => {
    if (request.path === '/v1/whoami') {
      if (mocks.whoamiError) throw mocks.whoamiError
      return mocks.whoami
    }
    if (request.path.startsWith('/v1/apps/')) return mocks.app
    if (request.path === '/v1/jobs') return { jobs: mocks.failedJobs }
    if (request.path === '/v1/status') return mocks.status
    throw new Error(request.path)
  },
}))

import { testEngramind } from '@/features/engramind/server/tester'
import { DomainError } from '@/lib/api/route'

const run = () => testEngramind({ emit: () => {}, signal: new AbortController().signal })
const admin = (slug = 'opex', scopes = ['read', 'write', 'delete']) => ({ token_id: 'tk_1', kind: 'admin', scopes, app: { id: 'app_1', slug }, agent: null, operations: [] })
const webhook = { webhook: { url: 'http://opex:3100/api/engramind/webhook', secret: { configured: true, updated_at: null } } }

describe('testEngramind', () => {
  beforeEach(() => {
    mocks.config = { baseUrl: 'http://engramind:8000', adminToken: 'eng.tk_1.x', opexPublicUrl: 'http://opex:3100' }
    mocks.ready = { ready: true, detail: 'ready' }
    mocks.whoami = admin()
    mocks.whoamiError = null
    mocks.app = webhook
    mocks.failedJobs = []
    mocks.status = { version: '0.8.0', backup: { status: 'ok', detail: null }, embedding: { state: 'ready' } }
  })

  it('verde com token próprio admin, webhook registrado e sem falhas', async () => {
    expect(await run()).toBe('Conectado ao Engramind 0.8.0 como opex')
  })

  it('amarelo: bootstrap, webhook ausente, entregas falhas e backup em falha', async () => {
    mocks.whoami = admin('bootstrap')
    mocks.app = { webhook: null }
    mocks.failedJobs = [{ id: 1 }]
    mocks.status = { ...mocks.status, backup: { status: 'fail', detail: 'sem réplica' } }
    const result = await run()
    expect(result).toMatchObject({ status: 'warn' })
    const message = (result as { message: string }).message
    expect(message).toContain('bootstrap')
    expect(message).toContain('webhook do Opex não registrado')
    expect(message).toContain('entregas de webhook falhas')
    expect(message).toContain('backup em falha')
  })

  it('vermelho: fora do ar, token inválido, sem delete ou sem configuração', async () => {
    mocks.ready = { ready: false, detail: 'ECONNREFUSED' }
    await expect(run()).rejects.toThrow('fora do ar')
    mocks.ready = { ready: true, detail: 'ready' }
    mocks.whoamiError = new DomainError(409, 'x', 'ENGRAMIND_AUTH_INVALID')
    await expect(run()).rejects.toThrow('Token inválido')
    mocks.whoamiError = null
    mocks.whoami = admin('opex', ['read', 'write'])
    await expect(run()).rejects.toThrow('read+write+delete')
    mocks.config = {}
    await expect(run()).rejects.toThrow('Sem URL base')
  })
})
