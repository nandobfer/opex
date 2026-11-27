import { describe, expect, it } from 'vitest'
import { commandCodePrice } from "@nandobfer/integracoes/modules/integrations/ia/ai/pricing/command-code"
import { listCostOf, reportedListCost } from "@nandobfer/integracoes/modules/integrations/ia/ai/pricing/compute"
import { modelsDevPrice, parseModelsDevCatalog } from "@nandobfer/integracoes/modules/integrations/ia/ai/pricing/models-dev"
import { tokensFromUsage } from "@nandobfer/integracoes/modules/integrations/ia/ai/pricing/usage"

/** OPE-203: preço por catálogo (models.dev, Command Code), cálculo do custo de tabela e os tokens da SDK `ai` v7. */

// Trechos reais do `https://models.dev/api.json` e do `/provider/v1/models?view=client` (26/11/2026).
const MODELS_DEV = {
  anthropic: { models: { 'claude-sonnet-4-6': { cost: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 } } } },
  openai: { models: { 'gpt-5.1': { cost: { input: 1.25, output: 10, cache_read: 0.125 } } } },
  google: {
    models: {
      'gemini-2.5-pro': { cost: { input: 1.25, output: 10, cache_read: 0.125, tiers: [{ input: 2.5, output: 15, cache_read: 0.25, tier: { type: 'context', size: 200000 } }], context_over_200k: { input: 2.5, output: 15, cache_read: 0.25 } } },
    },
  },
  deepseek: { models: { 'deepseek-v4-flash': { cost: { input: 0.15, output: 0.6 } } } },
}

const CC_HAIKU = { cacheReadCost: 0.01, cacheWriteCost: 0.125, inputCost: 0.1, outputCost: 0.5, contextTiers: [{ maxContext: 100000, rates: { cacheReadCost: 0.01, cacheWrite1hCost: 0.2, cacheWriteCost: 0.125, inputCost: 0.1, outputCost: 0.5 } }, { rates: { cacheReadCost: 0.05, cacheWrite1hCost: 1, cacheWriteCost: 0.625, inputCost: 0.5, outputCost: 2.5 } }] }

const tok = (input: number, cacheRead: number, cacheWrite: number, output: number) => ({ input: input + cacheRead + cacheWrite, noCache: input, cacheRead, cacheWrite, output, reasoning: null })

describe('models.dev', () => {
  const catalog = parseModelsDevCatalog(MODELS_DEV)

  it('fica só com os provedores usados (Gemini = google)', () => {
    expect(Object.keys(catalog).sort()).toEqual(['anthropic', 'gemini', 'openai'])
  })

  it('cobra entrada, cache lido e escrito e saída pelo preço de cada um', () => {
    const cost = listCostOf(tok(1_000_000, 1_000_000, 1_000_000, 1_000_000), modelsDevPrice(catalog, 'anthropic', 'claude-sonnet-4-6', '2026-11-26T00:00:00.000Z')!)
    expect(cost.usd).toBeCloseTo(3 + 0.3 + 3.75 + 15, 6)
    expect(cost.price).toMatchObject({ cacheReadPerMTok: 0.3, cacheWritePerMTok: 3.75, catalogAt: '2026-11-26T00:00:00.000Z', tier: null })
  })

  it('sem preço de escrita de cache, a escrita usa o preço de entrada', () => {
    const cost = listCostOf(tok(0, 0, 1_000_000, 0), modelsDevPrice(catalog, 'openai', 'gpt-5.1', null)!)
    expect(cost.usd).toBeCloseTo(1.25, 6)
  })

  it('faixa de contexto longo acima de 200 mil tokens de entrada', () => {
    const price = modelsDevPrice(catalog, 'gemini', 'gemini-2.5-pro', null)!
    expect(listCostOf(tok(200_000, 0, 0, 0), price).usd).toBeCloseTo(0.25, 6)
    const long = listCostOf(tok(300_000, 0, 0, 0), price)
    expect(long.usd).toBeCloseTo(0.75, 6)
    expect(long.price?.tier).toBe('long-context')
  })

  it('modelo fora do catálogo não tem preço (nunca zero)', () => {
    expect(modelsDevPrice(catalog, 'anthropic', 'claude-desconhecido', null)).toBeNull()
  })
})

describe('Command Code', () => {
  it('usa as faixas de contexto do catálogo', () => {
    const price = commandCodePrice(CC_HAIKU, null)!
    expect(listCostOf(tok(100_000, 0, 0, 100_000), price).usd).toBeCloseTo(0.01 + 0.05, 6)
    expect(listCostOf(tok(200_000, 0, 0, 0), price).usd).toBeCloseTo(0.1, 6)
  })

  it('sem faixas, o preço base; sem preço, nulo', () => {
    expect(commandCodePrice({ inputCost: 2, outputCost: 10, cacheReadCost: 0.1 }, null)!.tiers).toEqual([{ maxContext: null, rates: { inputPerMTok: 2, outputPerMTok: 10, cacheReadPerMTok: 0.1, cacheWritePerMTok: null } }])
    expect(commandCodePrice(null, null)).toBeNull()
  })
})

describe('cálculo do custo de tabela', () => {
  it('sem tokens informados, o custo é desconhecido com o motivo', () => {
    const price = commandCodePrice({ inputCost: 1, outputCost: 1 }, null)!
    expect(listCostOf({ input: null, noCache: null, cacheRead: null, cacheWrite: null, output: 10, reasoning: null }, price)).toMatchObject({ usd: null, missingReason: expect.stringContaining('tokens') })
  })

  it('OpenCode Go: o custo de tabela é o `list_cost` da resposta', () => {
    expect(reportedListCost(0.00002565, 'opencode-go-response')).toMatchObject({ usd: 0.000026, source: 'opencode-go-response', price: null })
    expect(reportedListCost(null, 'opencode-go-response').usd).toBeNull()
  })

  it('tokens separados do `usage` da SDK (inputTokenDetails/outputTokenDetails)', () => {
    expect(tokensFromUsage({ inputTokens: 100, outputTokens: 40, inputTokenDetails: { noCacheTokens: 60, cacheReadTokens: 30, cacheWriteTokens: 10 }, outputTokenDetails: { textTokens: 25, reasoningTokens: 15 } })).toEqual({
      input: 100,
      noCache: 60,
      cacheRead: 30,
      cacheWrite: 10,
      output: 40,
      reasoning: 15,
    })
    expect(tokensFromUsage({ inputTokens: 5 })).toMatchObject({ cacheRead: null, reasoning: null })
  })
})
