import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Serviço da "IA do Opex": aplicar (configurações + chave, auditoria sem segredo), testar sem gravar,
 * reenviar e a sincronização automática quando a chave muda no Opex (nunca propaga erro).
 */

const KEY = 'sk-opex-segredo-0001'

const mocks = vi.hoisted(() => ({
  keys: {} as Record<string, string | undefined>,
  engramindConfigured: true,
  state: { sources: {} as Record<string, Record<string, unknown> | null> },
  calls: [] as { method: string; path: string; body?: unknown; sensitive: boolean }[],
  settings: {} as Record<string, unknown>,
  secretUpdatedAt: null as string | null,
  failSecret: false,
  reindexing: false,
  audits: [] as Record<string, unknown>[],
  published: [] as unknown[],
  warn: vi.fn(),
  info: vi.fn(),
}))

vi.mock('@/lib/integrations/config', () => ({
  getIntegrationConfig: async (id: string) => (id === 'engramind' ? (mocks.engramindConfigured ? { baseUrl: 'http://engramind:8000', adminToken: 'eng.tk' } : {}) : { apiKey: mocks.keys[id] }),
  getIntegration: async (id: string) => ({ version: `v-${id}-${mocks.keys[id] ?? 'none'}` }),
}))
vi.mock('@/features/engramind/server/connection', () => ({ requireUsableConnection: async () => ({ kind: 'admin', scopes: ['read', 'write', 'delete'] }) }))
vi.mock('@/features/engramind/server/models', () => ({
  ENGRAMIND_STATE_ID: 'engramind',
  engramindDb: async () => {},
  EngramindState: {
    findById: () => ({ lean: async () => JSON.parse(JSON.stringify(mocks.state)) }),
    updateOne: async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
      for (const [path, value] of Object.entries(update.$set)) {
        const [, section, field] = path.split('.')
        mocks.state.sources[section!] = { ...(mocks.state.sources[section!] ?? {}), [field!]: value instanceof Date ? value.toISOString() : value }
      }
    },
  },
}))
vi.mock('@/features/engramind/server/shared', () => ({
  AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR' },
  auditEngramind: async (_actor: string, _id: string, _acao: string, depois: Record<string, unknown>) => {
    mocks.audits.push(depois)
  },
  engramindLog: { info: mocks.info, warn: mocks.warn, error: vi.fn() },
  publishEngramind: async (payload: unknown) => {
    mocks.published.push(payload)
  },
}))
vi.mock('@/features/engramind/server/client', () => ({
  engramindCall: async (method: string, request: { path: string; body?: Record<string, unknown> }, options: { sensitiveBody?: boolean } = {}) => {
    mocks.calls.push({ method, path: request.path, body: request.body, sensitive: options.sensitiveBody === true })
    if (request.path === '/v1/settings' && method === 'GET') {
      return { settings: [...Object.entries(mocks.settings).map(([key, value]) => ({ key, value })), { key: 'redator.api_key', value: null, secret: true, configured: true, updated_at: mocks.secretUpdatedAt }, { key: 'embedding.api_key', value: null, secret: true, configured: false, updated_at: null }] }
    }
    if (request.path === '/v1/settings' && method === 'PUT') {
      Object.assign(mocks.settings, request.body)
      return null
    }
    if (request.path === '/v1/status') return { embedding: { state: mocks.reindexing ? 'reindexing' : 'ready' } }
    if (request.path.startsWith('/v1/secrets/')) {
      if (mocks.failSecret) throw new Error('Engramind fora do ar')
      mocks.secretUpdatedAt = new Date().toISOString()
      return null
    }
    return { ok: true, model: 'gpt-4o', latency_ms: 120 }
  },
}))

import { applyOpexAiSource, getOpexAiSourceState, resendOpexAiKey, syncEngramindProviderKey, testOpexAiSource } from '@/features/engramind/server/ai-source'

const secretPuts = () => mocks.calls.filter((call) => call.path.startsWith('/v1/secrets/'))

beforeEach(() => {
  mocks.keys = { ai_openai: KEY, ai_gemini: 'gem-key-0001' }
  mocks.engramindConfigured = true
  mocks.state = { sources: {} }
  mocks.calls = []
  mocks.settings = {}
  mocks.secretUpdatedAt = null
  mocks.failSecret = false
  mocks.reindexing = false
  mocks.audits = []
  mocks.published = []
  mocks.warn.mockClear()
})

describe('applyOpexAiSource', () => {
  it('Redator: grava as configurações com a URL implícita e depois a chave (corpo sensível); auditoria sem segredo', async () => {
    const result = await applyOpexAiSource({ section: 'redator', source: { provider: 'openai', model: 'gpt-4o', fallbackModels: ['gpt-4o-mini'] } }, 'local')
    expect(result.keySynced).toBe(true)
    const put = mocks.calls.find((call) => call.path === '/v1/settings' && call.method === 'PUT')
    expect(put?.body).toEqual({ 'redator.provider': 'openai_compatible', 'redator.model': 'gpt-4o', 'redator.base_url': 'https://api.openai.com/v1', 'redator.fallback_models': ['gpt-4o-mini'] })
    expect(secretPuts()).toEqual([{ method: 'PUT', path: '/v1/secrets/redator.api_key', body: { value: KEY }, sensitive: true }])
    expect(mocks.calls.indexOf(put!)).toBeLessThan(mocks.calls.indexOf(secretPuts()[0]!))
    expect(JSON.stringify(mocks.audits)).not.toContain(KEY)
    expect(JSON.stringify(result)).not.toContain(KEY)
    expect(result.state.redator.origin).toBe('opex')
    expect(mocks.published).toContainEqual(expect.objectContaining({ type: 'settings.updated' }))
  })

  it('sem chave no Opex: 409 e nada gravado', async () => {
    mocks.keys = {}
    await expect(applyOpexAiSource({ section: 'redator', source: { provider: 'anthropic', model: 'claude' } }, 'local')).rejects.toMatchObject({ status: 409, code: 'ENGRAMIND_AI_KEY_MISSING' })
    expect(mocks.calls.filter((call) => call.method !== 'GET')).toEqual([])
  })

  it('Redator: falha ao gravar a chave mantém as configurações e marca a chave como não sincronizada', async () => {
    mocks.failSecret = true
    const result = await applyOpexAiSource({ section: 'redator', source: { provider: 'openai', model: 'gpt-4o' } }, 'local')
    expect(result.keySynced).toBe(false)
    expect(mocks.settings['redator.model']).toBe('gpt-4o')
    expect(result.state.redator.syncError).toContain('fora do ar')
    expect(mocks.warn).toHaveBeenCalled()
  })

  it('embedding: com reindexação em andamento → 409 sem gravar', async () => {
    mocks.reindexing = true
    await expect(applyOpexAiSource({ section: 'embedding', source: { provider: 'gemini', model: 'gemini-embedding-001' } }, 'local')).rejects.toMatchObject({ status: 409, code: 'ENGRAMIND_REINDEXING' })
    expect(mocks.calls.filter((call) => call.method !== 'GET')).toEqual([])
  })

  it('embedding remoto: testa a proposta com a chave, grava a chave e só depois as configurações', async () => {
    await applyOpexAiSource({ section: 'embedding', source: { provider: 'gemini', model: 'gemini-embedding-001', dimensions: 768 } }, 'local')
    const order = mocks.calls.filter((call) => call.method !== 'GET').map((call) => call.path)
    expect(order).toEqual(['/v1/settings/embedding/test', '/v1/secrets/embedding.api_key', '/v1/settings'])
    expect(mocks.calls.find((call) => call.path === '/v1/settings/embedding/test')?.sensitive).toBe(true)
    expect(mocks.settings).toMatchObject({ 'embedding.provider': 'gemini', 'embedding.base_url': null, 'embedding.dimensions': 768 })
  })

  it('embedding local: sem chave e sem segredo enviado', async () => {
    const result = await applyOpexAiSource({ section: 'embedding', source: { provider: 'local', model: 'multilingual-e5-small' } }, 'local')
    expect(result.keySynced).toBe(true)
    expect(secretPuts()).toEqual([])
  })
})

describe('testOpexAiSource', () => {
  it('manda a proposta com a chave lida no servidor e não grava nada', async () => {
    await expect(testOpexAiSource({ section: 'redator', source: { provider: 'deepseek', model: 'deepseek-chat' } })).rejects.toMatchObject({ code: 'ENGRAMIND_AI_KEY_MISSING' })
    mocks.keys.ai_deepseek = 'ds-key-0001'
    const result = await testOpexAiSource({ section: 'redator', source: { provider: 'deepseek', model: 'deepseek-chat' } })
    const call = mocks.calls.at(-1)!
    expect(call.path).toBe('/v1/settings/redator/test')
    expect(call.sensitive).toBe(true)
    expect(call.body).toMatchObject({ settings: { 'redator.provider': 'openai_compatible', 'redator.base_url': 'https://api.deepseek.com', 'redator.api_key': 'ds-key-0001' } })
    expect(mocks.calls.some((item) => item.path === '/v1/settings' && item.method === 'PUT')).toBe(false)
    expect(JSON.stringify(result)).not.toContain('ds-key-0001')
  })
})

describe('origem com mudança por fora', () => {
  it('modelo trocado no Engramind depois de aplicar → "engramind"', async () => {
    await applyOpexAiSource({ section: 'redator', source: { provider: 'openai', model: 'gpt-4o' } }, 'local')
    mocks.settings['redator.model'] = 'outro-modelo'
    const state = await getOpexAiSourceState()
    expect(state.redator.origin).toBe('engramind')
    expect(state.redator.current.model).toBe('outro-modelo')
  })
})

describe('syncEngramindProviderKey', () => {
  beforeEach(async () => {
    await applyOpexAiSource({ section: 'redator', source: { provider: 'openai', model: 'gpt-4o' } }, 'local')
    await applyOpexAiSource({ section: 'embedding', source: { provider: 'openai', model: 'text-embedding-3-small' } }, 'local')
    mocks.calls = []
  })

  it('trocar a chave da origem reenvia para as duas seções que a usam', async () => {
    mocks.keys.ai_openai = 'sk-nova-0002'
    await syncEngramindProviderKey('ai_openai')
    expect(secretPuts().map((call) => [call.path, call.body])).toEqual([
      ['/v1/secrets/redator.api_key', { value: 'sk-nova-0002' }],
      ['/v1/secrets/embedding.api_key', { value: 'sk-nova-0002' }],
    ])
  })

  it('outro provedor não envia nada', async () => {
    await syncEngramindProviderKey('ai_gemini')
    expect(mocks.calls).toEqual([])
  })

  it('Engramind não configurado: nada é feito', async () => {
    mocks.engramindConfigured = false
    await syncEngramindProviderKey('ai_openai')
    expect(mocks.calls).toEqual([])
  })

  it('chave apagada no Opex: nada enviado e aviso persistido', async () => {
    mocks.keys.ai_openai = undefined
    await syncEngramindProviderKey('ai_openai')
    expect(secretPuts()).toEqual([])
    expect(mocks.state.sources.redator?.syncError).toBe('Chave apagada no Opex')
  })

  it('falha no Engramind não propaga: vira syncError e aviso no log', async () => {
    mocks.failSecret = true
    await expect(syncEngramindProviderKey('ai_openai')).resolves.toBeUndefined()
    expect(mocks.state.sources.embedding?.syncError).toContain('fora do ar')
    expect(mocks.warn).toHaveBeenCalled()
  })

  it('reenviar à mão limpa o erro', async () => {
    mocks.state.sources.redator = { ...mocks.state.sources.redator, syncError: 'x' }
    const state = await resendOpexAiKey({ section: 'redator' }, 'local')
    expect(state.redator.syncError).toBeNull()
    expect(secretPuts()).toHaveLength(1)
  })
})
