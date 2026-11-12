import { describe, expect, it, vi } from 'vitest'

/**
 * Texto do turno do OpenCode (OPE-162): blocos distintos (outra parte/mensagem, ou texto depois de uma
 * ferramenta) não ficam colados na mesma linha em `result.text` nem no `onText`; a saída publicada
 * segue com os deltas originais (a tela não muda).
 */

vi.mock('@/lib/ai/consumption', () => ({ recordAiConsumption: vi.fn(async () => {}) }))

import { runAgentTurn, type TurnEvent } from '@/lib/ai/opencode-run'
import type { OpencodeClient } from '@/lib/ai/opencode-client'

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

const base = { id: 'r1', sessionId: 's1', stage: 'Refinamento', title: 'Refinamento', agent: { agent: 'build', model: null, variant: null }, text: 'Refine', timeoutMs: 60_000, signal: new AbortController().signal }

async function run(events: unknown[]) {
  const published: TurnEvent[] = []
  const pieces: string[] = []
  const result = await runAgentTurn(scripted(events), base, { publish: (event) => published.push(event), onText: (delta) => void pieces.push(delta) })
  const shown = published.flatMap((event) => (event.type === 'text' ? [event.text] : [])).join('')
  return { result, onText: pieces.join(''), shown }
}

describe('texto do turno por blocos', () => {
  it('partes de texto distintas da mesma mensagem ganham uma linha em branco entre elas', async () => {
    const { result, onText, shown } = await run([
      ev('session.text.delta', { assistantMessageID: 'm1', ordinal: 0, delta: 'Segue a especificação consolidada:' }),
      ev('session.text.delta', { assistantMessageID: 'm1', ordinal: 1, delta: '## Especificação técnica\n\n' }),
      ev('session.text.delta', { assistantMessageID: 'm1', ordinal: 1, delta: '- critério' }),
    ])
    expect(result.text).toBe('Segue a especificação consolidada:\n\n## Especificação técnica\n\n- critério')
    expect(onText).toBe(result.text)
    expect(shown).toBe('Segue a especificação consolidada:## Especificação técnica\n\n- critério')
  })

  it('sem identificador de parte, o texto depois de uma ferramenta começa em bloco novo', async () => {
    const { result } = await run([
      ev('session.text.delta', { delta: 'Vou consolidar.' }),
      ev('session.tool.input.started', { id: 't1', name: 'read' }),
      ev('session.tool.success', { id: 't1', content: [{ type: 'text', text: 'ok' }] }),
      ev('session.text.delta', { delta: '## Especificação técnica' }),
    ])
    expect(result.text).toBe('Vou consolidar.\n\n## Especificação técnica')
  })

  it('deltas do mesmo bloco continuam colados', async () => {
    const { result } = await run([
      ev('session.text.delta', { assistantMessageID: 'm1', ordinal: 0, delta: '## Especifi' }),
      ev('session.text.delta', { assistantMessageID: 'm1', ordinal: 0, delta: 'cação técnica' }),
      ev('session.text.delta', { delta: ' fim' }),
    ])
    expect(result.text).toBe('## Especificação técnica fim')
  })
})
