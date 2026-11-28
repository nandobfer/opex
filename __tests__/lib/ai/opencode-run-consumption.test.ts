import { beforeEach, describe, expect, it, vi } from 'vitest'

/** OPE-205: o runner de sessão grava os tokens separados (cache e raciocínio) de cada passo do OpenCode. */

const mocks = vi.hoisted(() => ({ record: vi.fn(async () => {}) }))
vi.mock('@nandobfer/integracoes/modules/integrations/ia/ai/consumption', () => ({ recordAiConsumption: mocks.record }))

import { runAgentTurn } from "@/lib/ai/opencode-run"
import type { OpencodeClient } from "@nandobfer/integracoes/modules/integrations/ia/ai/opencode-client"

const ev = (type: string, data: Record<string, unknown> = {}) => ({ type, data: { sessionID: 's1', ...data } })

function scripted(events: unknown[]): OpencodeClient {
  let release: () => void = () => {}
  const prompted = new Promise<void>((resolve) => (release = resolve))
  return {
    session: {
      switchAgent: vi.fn().mockResolvedValue(undefined),
      switchModel: vi.fn().mockResolvedValue(undefined),
      prompt: vi.fn(async () => release()),
      interrupt: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockResolvedValue(null),
    },
    event: {
      subscribe: (opts: { onActivity?: () => void }) =>
        (async function* () {
          opts.onActivity?.()
          yield { type: 'server.connected', data: {} }
          await prompted
          for (const event of events) yield event
          yield ev('session.execution.succeeded')
        })(),
    },
  } as unknown as OpencodeClient
}

const base = {
  id: 'r1',
  sessionId: 's1',
  stage: 'Refinamento',
  title: 'Refinamento',
  agent: { agent: 'build', model: 'anthropic/claude', variant: null },
  text: 'Refine',
  timeoutMs: 60_000,
  signal: new AbortController().signal,
  consumption: { origin: 'refinement', subject: 'task1' },
}

describe('consumo do passo do OpenCode (OPE-205)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('grava o cache separado e mantém inputTokens como a entrada sem cache do OpenCode', async () => {
    await runAgentTurn(
      scripted([
        ev('session.text.delta', { delta: 'Ok' }),
        ev('session.step.ended', { assistantMessageID: 'm1', cost: 0.02, tokens: { input: 100, output: 30, reasoning: 10, cache: { read: 200, write: 50 } } }),
      ]),
      base,
      {},
    )
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupKey: 'session:refinement:r1:m1',
        provider: 'opencode',
        origin: 'refinement',
        subject: 'task1',
        // Decisão do dono: os totais antigos não mudam (entrada sem cache no OpenCode de sessão).
        inputTokens: 100,
        outputTokens: 30,
        totalTokens: 140,
        tokenDetails: { noCache: 100, cacheRead: 200, cacheWrite: 50, output: 40, reasoning: 10 },
      }),
    )
  })

  it('sem `tokens.cache` no evento, o cache fica null (não informado), nunca 0', async () => {
    await runAgentTurn(
      scripted([ev('session.step.ended', { assistantMessageID: 'm2', cost: 0, tokens: { input: 10, output: 5, reasoning: 0 } })]),
      base,
      {},
    )
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ tokenDetails: { noCache: 10, cacheRead: null, cacheWrite: null, output: 5, reasoning: 0 } }))
  })

  it('`tokens.cache` com o lido e sem o escrito: o cache fica não informado (o passo sai da Taxa de cache)', async () => {
    await runAgentTurn(
      scripted([ev('session.step.ended', { assistantMessageID: 'm3', cost: 0, tokens: { input: 100, output: 5, reasoning: 0, cache: { read: 900 } } })]),
      base,
      {},
    )
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 100, tokenDetails: { noCache: 100, cacheRead: null, cacheWrite: null, output: 5, reasoning: 0 } }))
  })
})
