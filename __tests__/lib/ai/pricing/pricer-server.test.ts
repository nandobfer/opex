import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * OPE-203 (regra m_d10f596b): o catálogo de preços tem prazo próprio e recebe o sinal de quem pediu; falhou, vale a
 * última cópia boa (memória, depois o banco) com aviso no log; sem cópia, os passos ficam sem preço com o motivo;
 * cancelamento de quem pediu propaga.
 */

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  warn: vi.fn(),
  stored: null as null | { data: unknown; fetchedAt: Date },
  ccCatalog: vi.fn(),
}))

vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: vi.fn(async (id: string) => (id === 'models_dev' ? { apiUrl: 'https://models.dev/api.json' } : { offPeakHolidays: '' })) }))
vi.mock('@/lib/integrations/debug', () => ({ integrationDebug: () => ({}), debugFetch: (_dbg: unknown, _label: string, url: string, init: RequestInit) => mocks.fetch(url, init) }))
vi.mock('@/lib/logger', () => ({ loggerFor: () => ({ warn: mocks.warn, info: vi.fn(), error: vi.fn() }) }))
vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(async () => undefined) }))
vi.mock('@/lib/db/models/AiPriceCatalog', () => ({
  AiPriceCatalog: { findOne: () => ({ lean: async () => mocks.stored }), updateOne: vi.fn(async () => ({})) },
}))
vi.mock('@/lib/ai/command-code', () => ({ commandCodePricingCatalog: mocks.ccCatalog }))

import { createStepPricer, loadModelsDevCatalog, resetPricingCacheForTests } from '@/lib/ai/pricing/server'

const tokens = { input: 1_000_000, noCache: 1_000_000, cacheRead: 0, cacheWrite: 0, output: 0, reasoning: null }
const body = { anthropic: { models: { 'claude-sonnet-4-6': { cost: { input: 3, output: 15 } } } } }
const okResponse = () => new Response(JSON.stringify(body), { status: 200 })

beforeEach(() => {
  resetPricingCacheForTests()
  mocks.fetch.mockReset()
  mocks.warn.mockReset()
  mocks.ccCatalog.mockReset()
  mocks.stored = null
})

describe('catálogo do models.dev', () => {
  it('a busca recebe o sinal de quem pediu (combinado ao prazo próprio)', async () => {
    mocks.fetch.mockImplementation(async () => okResponse())
    const controller = new AbortController()
    const pricer = await createStepPricer({ provider: 'anthropic', model: 'claude-sonnet-4-6', signal: controller.signal })
    const signal = mocks.fetch.mock.calls[0]![1].signal as AbortSignal
    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal.aborted).toBe(false)
    controller.abort()
    expect(signal.aborted).toBe(true)
    expect(pricer.price(tokens, new Date()).usd).toBe(3)
  })

  it('cancelamento interrompe uma busca travada e propaga (não vira "sem preço")', async () => {
    mocks.fetch.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason))))
    const controller = new AbortController()
    const pending = createStepPricer({ provider: 'anthropic', model: 'claude-sonnet-4-6', signal: controller.signal })
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalled())
    controller.abort(new Error('cancelado'))
    await expect(pending).rejects.toThrow('cancelado')
  })

  it('falhou: usa o último catálogo lido em memória, com aviso no log', async () => {
    mocks.fetch.mockImplementationOnce(async () => okResponse())
    await loadModelsDevCatalog()
    mocks.fetch.mockImplementationOnce(async () => new Response('erro', { status: 503 }))
    const copy = await loadModelsDevCatalog(undefined, { fresh: true })
    expect(copy?.data.anthropic?.['claude-sonnet-4-6']).toBeTruthy()
    expect(mocks.warn).toHaveBeenCalledWith(expect.objectContaining({ err: expect.stringContaining('503') }), expect.stringContaining('último catálogo'))
  })

  it('sem memória: usa a cópia gravada no banco', async () => {
    mocks.stored = { data: { anthropic: { 'claude-sonnet-4-6': { input: 3, output: 15 } } }, fetchedAt: new Date('2026-11-20T00:00:00Z') }
    mocks.fetch.mockRejectedValue(new Error('fetch failed'))
    const pricer = await createStepPricer({ provider: 'anthropic', model: 'claude-sonnet-4-6' })
    expect(pricer.price(tokens, new Date())).toMatchObject({ usd: 3, price: { catalogAt: '2026-11-20T00:00:00.000Z' } })
    expect(mocks.warn).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('gravada no banco'))
  })

  it('sem nenhuma cópia: passos sem preço com o motivo e log', async () => {
    mocks.fetch.mockRejectedValue(new Error('fetch failed'))
    const pricer = await createStepPricer({ provider: 'anthropic', model: 'claude-sonnet-4-6' })
    expect(pricer.price(tokens, new Date())).toMatchObject({ usd: null, missingReason: 'Catálogo de preços do models.dev indisponível' })
    expect(mocks.warn).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('sem cópia anterior'))
  })
})

describe('outras fontes', () => {
  it('Command Code: o sinal chega ao catálogo da geração; modelo sem preço tem o motivo', async () => {
    mocks.ccCatalog.mockResolvedValue({ pricing: { 'gpt-x': { inputCost: 1, outputCost: 2 } }, at: '2026-11-26T00:00:00.000Z' })
    const signal = new AbortController().signal
    const pricer = await createStepPricer({ provider: 'command-code', model: 'gpt-x', signal })
    expect(mocks.ccCatalog).toHaveBeenCalledWith(signal)
    expect(pricer.price(tokens, new Date()).usd).toBe(1)
    const other = await createStepPricer({ provider: 'command-code', model: 'outro', signal })
    expect(other.price(tokens, new Date()).missingReason).toContain('outro')
  })

  it('OpenCode Go: custo de tabela vem da resposta; DeepSeek: modelo fora da tabela tem o motivo', async () => {
    const go = await createStepPricer({ provider: 'opencode-go', model: 'kimi' })
    expect(go.price(tokens, new Date(), { source: 'go', allowanceUsd: 0.1, listCostUsd: 0.2 }).usd).toBe(0.2)
    const deepseek = await createStepPricer({ provider: 'deepseek', model: 'deepseek-chat' })
    expect(deepseek.price(tokens, new Date()).missingReason).toContain('tabela oficial do DeepSeek')
  })
})
