import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Entrada completa das ferramentas (`rawInput`) nos eventos do turno do OpenCode: só sai quando o
 * chamador pede (`exposeRawToolInput`, Agente Maddox). Mesas, forks e revisões gravam e publicam só o
 * resumo cortado — nunca o argumento inteiro (conteúdo de arquivo, comando com token).
 */

const mocks = vi.hoisted(() => ({ publish: vi.fn() }))
vi.mock('@/features/agentic/server/hub', () => ({ publishWorkbenchEvent: mocks.publish }))
vi.mock('@/lib/ai/consumption', () => ({ recordAiConsumption: vi.fn(async () => {}) }))

import { runAgentTurn as runOpencodeTurn, type TurnEvent } from '@/lib/ai/opencode-run'
import { runAgentTurn as runWorkbenchTurn } from '@/features/agentic/server/runner'
import type { OpencodeClient } from '@/lib/ai/opencode-client'

const SECRET = 'export GH_TOKEN=ghp_SEGREDO_COMPLETO'
const ev = (type: string, data: Record<string, unknown> = {}) => ({ type, data: { sessionID: 's1', ...data } })

function toolClient(): OpencodeClient {
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
          yield ev('session.tool.input.started', { id: 't1', name: 'bash' })
          yield ev('session.tool.called', { id: 't1', input: { command: 'ls', script: SECRET } })
          yield ev('session.tool.success', { id: 't1', content: [{ type: 'text', text: 'ok' }] })
          yield ev('session.execution.succeeded')
        })(),
    },
  } as unknown as OpencodeClient
}

const base = { sessionId: 's1', stage: 'implementing' as const, title: 'Implementando', agent: { agent: 'build', model: null, variant: null }, text: 'Implemente', timeoutMs: 60_000, signal: new AbortController().signal }

beforeEach(() => vi.clearAllMocks())

describe('entrada completa das ferramentas', () => {
  it('mesa agêntica: o evento publicado (e gravado pelo hub) não traz rawInput nem o argumento inteiro', async () => {
    await runWorkbenchTurn(toolClient(), { ...base, workbenchId: 'w-raw' })
    const tools = mocks.publish.mock.calls.map((call) => call[1] as TurnEvent).filter((event) => event.type === 'tool')
    expect(tools.length).toBeGreaterThan(0)
    for (const event of tools) expect(event).not.toHaveProperty('rawInput')
    expect(JSON.stringify(mocks.publish.mock.calls)).not.toContain('ghp_SEGREDO_COMPLETO')
  })

  it('com exposeRawToolInput (Agente Maddox) a entrada completa vem nos eventos da ferramenta', async () => {
    const events: TurnEvent[] = []
    await runOpencodeTurn(toolClient(), { ...base, id: 'maddox:s', exposeRawToolInput: true }, { publish: (event) => events.push(event) })
    const done = events.find((event) => event.type === 'tool' && event.state === 'done')
    expect(done).toMatchObject({ rawInput: { command: 'ls', script: SECRET } })
  })
})
