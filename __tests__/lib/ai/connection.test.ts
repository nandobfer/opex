import { beforeEach, describe, expect, it, vi } from 'vitest'

/** OPE-91: o status gravado (último teste) não bloqueia sozinho; a conexão é conferida na hora. */

const mocks = vi.hoisted(() => ({
  statuses: vi.fn(),
  models: vi.fn(),
  info: vi.fn(),
  runTest: vi.fn(async () => ({ ok: true, latencyMs: 1, message: 'ok' })),
}))

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/ai/catalog', () => ({ getAiProviderStatuses: mocks.statuses, listAiModels: mocks.models }))
vi.mock('@/lib/ai/opencode', () => ({ getOpencodeInfo: mocks.info }))
vi.mock('@/features/integrations/services/integration-test-runner', () => ({ runIntegrationTest: mocks.runTest }))

import { AiProviderError } from '@/lib/ai/errors'
import { confirmAiProviderConnection, resetAiConnectionProbes } from '@/lib/ai/connection'

const statuses = (opencode: { configured?: boolean; connected?: boolean }, gemini: { configured?: boolean; connected?: boolean } = {}) => [
  { id: 'opencode', integrationId: 'ai_opencode', name: 'OpenCode', configured: true, connected: true, ...opencode },
  { id: 'gemini', integrationId: 'ai_gemini', name: 'Gemini', configured: true, connected: true, ...gemini },
]

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  vi.clearAllMocks()
  resetAiConnectionProbes()
  mocks.statuses.mockResolvedValue(statuses({}))
  mocks.info.mockResolvedValue({ version: '2.1.0' })
  mocks.models.mockResolvedValue([])
})

describe('confirmAiProviderConnection', () => {
  it('status gravado conectado: não chama o provedor', async () => {
    expect(await confirmAiProviderConnection('opencode')).toEqual({ configured: true, connected: true, detail: null })
    expect(mocks.info).not.toHaveBeenCalled()
  })

  it('não configurado: não testa', async () => {
    mocks.statuses.mockResolvedValue(statuses({ configured: false, connected: false }))
    expect(await confirmAiProviderConnection('opencode')).toEqual({ configured: false, connected: false, detail: null })
    expect(mocks.info).not.toHaveBeenCalled()
  })

  it('status gravado desatualizado e OpenCode respondendo: conectado e regrava o status uma vez', async () => {
    mocks.statuses.mockResolvedValue(statuses({ connected: false }))
    expect(await confirmAiProviderConnection('opencode')).toEqual({ configured: true, connected: true, detail: null })
    expect(mocks.info).toHaveBeenCalledTimes(1)
    await flush()
    expect(mocks.runTest).toHaveBeenCalledTimes(1)
    expect(mocks.runTest).toHaveBeenCalledWith('ai_opencode', { source: 'scheduler' })
  })

  it('indisponível de fato: devolve o motivo real', async () => {
    mocks.statuses.mockResolvedValue(statuses({ connected: false }))
    mocks.info.mockRejectedValue(new AiProviderError('OpenCode inacessível em http://pc:4096 (ECONNREFUSED)'))
    expect(await confirmAiProviderConnection('opencode')).toEqual({ configured: true, connected: false, detail: 'OpenCode inacessível em http://pc:4096 (ECONNREFUSED)' })
    await flush()
    expect(mocks.runTest).not.toHaveBeenCalled()
  })

  it('timeout vira mensagem legível', async () => {
    mocks.statuses.mockResolvedValue(statuses({ connected: false }))
    mocks.info.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'TimeoutError' }))
    expect((await confirmAiProviderConnection('opencode')).detail).toBe('tempo limite excedido')
  })

  it('outros provedores são testados listando os modelos (sem cache)', async () => {
    mocks.statuses.mockResolvedValue(statuses({}, { connected: false }))
    expect((await confirmAiProviderConnection('gemini')).connected).toBe(true)
    expect(mocks.models).toHaveBeenCalledWith('gemini', expect.objectContaining({ fresh: true }))
    expect(mocks.info).not.toHaveBeenCalled()
  })

  it('chamadas simultâneas e seguidas reusam o mesmo teste por alguns segundos', async () => {
    mocks.statuses.mockResolvedValue(statuses({ connected: false }))
    mocks.info.mockRejectedValue(new AiProviderError('fora'))
    await Promise.all([confirmAiProviderConnection('opencode'), confirmAiProviderConnection('opencode')])
    await confirmAiProviderConnection('opencode')
    expect(mocks.info).toHaveBeenCalledTimes(1)
  })

  it('o resultado guardado expira e a conexão restabelecida volta a valer', async () => {
    vi.useFakeTimers()
    try {
      mocks.statuses.mockResolvedValue(statuses({ connected: false }))
      mocks.info.mockRejectedValueOnce(new AiProviderError('fora'))
      expect((await confirmAiProviderConnection('opencode')).connected).toBe(false)
      vi.advanceTimersByTime(16_000)
      expect((await confirmAiProviderConnection('opencode')).connected).toBe(true)
      expect(mocks.info).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
