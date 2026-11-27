import { describe, expect, it } from 'vitest'
import { tokenDetailsOf, tokensFromOpencode, tokensFromUsage } from '@/lib/ai/pricing/usage'

/** OPE-205: extração dos tokens separados (cache e raciocínio) — fonte única de todo o consumo de IA. */

describe('tokensFromUsage (SDK ai v7)', () => {
  it('lê entrada sem cache, cache lido/escrito, saída e reasoning do detalhe do provedor', () => {
    const tokens = tokensFromUsage({
      inputTokens: 100,
      outputTokens: 40,
      inputTokenDetails: { noCacheTokens: 20, cacheReadTokens: 70, cacheWriteTokens: 10 },
      outputTokenDetails: { textTokens: 30, reasoningTokens: 10 },
    })
    expect(tokens).toEqual({ input: 100, noCache: 20, cacheRead: 70, cacheWrite: 10, output: 40, reasoning: 10 })
    expect(tokenDetailsOf(tokens)).toEqual({ noCache: 20, cacheRead: 70, cacheWrite: 10, output: 40, reasoning: 10 })
  })

  it('campo ausente fica null (não informado), nunca 0; zero informado fica 0', () => {
    expect(tokensFromUsage({ inputTokens: 100, outputTokens: 20 })).toEqual({ input: 100, noCache: null, cacheRead: null, cacheWrite: null, output: 20, reasoning: null })
    // O provedor pode informar 0 explicitamente (nenhum token de cache): é medição, não ausência.
    expect(tokensFromUsage({ inputTokenDetails: { cacheReadTokens: 0 }, outputTokenDetails: { reasoningTokens: 0 } })).toMatchObject({ cacheRead: 0, reasoning: 0, noCache: null })
    expect(tokensFromUsage(null)).toEqual({ input: null, noCache: null, cacheRead: null, cacheWrite: null, output: null, reasoning: null })
  })
})

describe('tokensFromOpencode (sessão OpenCode 2.x)', () => {
  it('separa o cache; a entrada total é a soma das três partes e a saída total soma o raciocínio', () => {
    expect(tokensFromOpencode({ input: 100, output: 30, reasoning: 10, cacheRead: 200, cacheWrite: 50 })).toEqual({
      input: 350,
      noCache: 100,
      cacheRead: 200,
      cacheWrite: 50,
      output: 40,
      reasoning: 10,
    })
  })

  it('sem `tokens.cache` no evento, o cache e a entrada total ficam null (não informado)', () => {
    expect(tokensFromOpencode({ input: 100, output: 30, reasoning: 0, cacheRead: null, cacheWrite: null })).toEqual({
      input: null,
      noCache: 100,
      cacheRead: null,
      cacheWrite: null,
      output: 30,
      reasoning: 0,
    })
    expect(tokensFromOpencode({ input: 100, output: 30, reasoning: 0 })).toMatchObject({ input: null, cacheRead: null, cacheWrite: null })
  })

  it('cache com zero informado não impede a entrada total (o servidor OpenCode converte ausência em 0)', () => {
    expect(tokensFromOpencode({ input: 100, output: 5, reasoning: 0, cacheRead: 0, cacheWrite: 0 })).toMatchObject({ input: 100, cacheRead: 0, cacheWrite: 0 })
  })
})
