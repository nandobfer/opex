import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
const deleteMany = vi.hoisted(() => vi.fn(async () => ({ deletedCount: 1 })))
const cursor = vi.hoisted(() => ({
  docs: [] as { seq: number; ts: Date; payload: unknown }[],
  close: vi.fn(async () => undefined),
  batchSize: 0,
}))
const find = vi.hoisted(() =>
  vi.fn(() => ({
    sort: () => ({
      lean: () => ({
        cursor: ({ batchSize }: { batchSize: number }) => {
          cursor.batchSize = batchSize
          return {
            close: cursor.close,
            async *[Symbol.asyncIterator]() {
              yield* cursor.docs
            },
          }
        },
      }),
    }),
  })),
)
vi.mock('@/lib/db/models/Agentic', () => ({ AgenticEvent: { deleteMany, find, insertMany: vi.fn(async () => []) } }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { coalesceEvents, dropIdlePrWatchEvents, publishWorkbenchEvent, streamWorkbenchEvents, subscribeWorkbench } from '@/features/agentic/server/hub'

const ts = '2026-10-09T12:00:00.000Z'

describe('hub da mesa', () => {
  it('OPE-188: streamWorkbenchEvents lê o histórico por cursor em lotes, em ordem, e fecha o cursor', async () => {
    cursor.docs = [
      { seq: 1, ts: new Date(ts), payload: { type: 'notice', level: 'info', message: 'a' } },
      { seq: 2, ts: new Date(ts), payload: { type: 'text', text: 'b' } },
    ]
    const events = []
    for await (const event of streamWorkbenchEvents('wb-cursor')) events.push(event)
    expect(find).toHaveBeenCalledWith({ workbenchId: 'wb-cursor' })
    expect(cursor.batchSize).toBeGreaterThan(0)
    expect(events).toEqual([
      { type: 'notice', level: 'info', message: 'a', seq: 1, ts },
      { type: 'text', text: 'b', seq: 2, ts },
    ])
    expect(cursor.close).toHaveBeenCalled()
  })

  it('OPE-188: streamWorkbenchEvents para quando o stream fecha (e fecha o cursor)', async () => {
    cursor.close.mockClear()
    cursor.docs = [1, 2, 3].map((seq) => ({ seq, ts: new Date(ts), payload: { type: 'text', text: String(seq) } }))
    let open = true
    const events = []
    for await (const event of streamWorkbenchEvents('wb-cursor', () => open)) {
      events.push(event)
      open = false
    }
    expect(events).toHaveLength(1)
    expect(cursor.close).toHaveBeenCalled()
  })

  it('coalesceEvents junta textos consecutivos com o seq do último pedaço', () => {
    const merged = coalesceEvents([
      { type: 'text', text: 'a', seq: 1, ts },
      { type: 'text', text: 'b', seq: 2, ts },
      { type: 'notice', level: 'info', message: 'x', seq: 3, ts },
      { type: 'text', text: 'c', seq: 4, ts },
    ])
    expect(merged).toEqual([
      { type: 'text', text: 'ab', seq: 2, ts },
      { type: 'notice', level: 'info', message: 'x', seq: 3, ts },
      { type: 'text', text: 'c', seq: 4, ts },
    ])
  })

  it('publica ao vivo com seq crescente; raciocínio é transitório (sem seq)', () => {
    const seen: unknown[] = []
    const stop = subscribeWorkbench('wb-hub', (event) => seen.push(event))
    publishWorkbenchEvent('wb-hub', { type: 'text', text: 'oi' })
    publishWorkbenchEvent('wb-hub', { type: 'reasoning' })
    publishWorkbenchEvent('wb-hub', { type: 'notice', level: 'info', message: 'x' })
    stop()
    expect(seen).toMatchObject([{ type: 'text', seq: 1 }, { type: 'reasoning' }, { type: 'notice', seq: 2 }])
    expect((seen[1] as { seq?: number }).seq).toBeUndefined()
  })

  it('passo da verificação do PR é transitório; a verificação concluída é gravada', () => {
    const seen: { type: string; seq?: number }[] = []
    const stop = subscribeWorkbench('wb-prw', (event) => seen.push(event))
    publishWorkbenchEvent('wb-prw', { type: 'pr-watch-step', checkId: 'a', prNumber: 7, level: 'info', text: 'Consultando…' })
    publishWorkbenchEvent('wb-prw', { type: 'pr-watch', checkId: 'a', prNumber: 7, startedAt: ts, steps: [], outcome: 'idle', summary: 'Nada a fazer', nextCheckAt: null })
    stop()
    expect(seen[0]!.seq).toBeUndefined()
    expect(seen[1]).toMatchObject({ type: 'pr-watch', seq: 1 })
  })

  it('dropIdlePrWatchEvents apaga só as verificações sem novidade da mesa', async () => {
    await dropIdlePrWatchEvents('wb-drop')
    expect(deleteMany).toHaveBeenCalledWith({ workbenchId: 'wb-drop', 'payload.type': 'pr-watch', 'payload.outcome': 'idle' })
  })

  it('corta a saída longa de ferramenta guardando o fim', () => {
    const seen: { output?: string }[] = []
    const stop = subscribeWorkbench('wb-clip', (event) => seen.push(event as { output?: string }))
    publishWorkbenchEvent('wb-clip', { type: 'tool', id: 't', name: 'bash', state: 'done', output: `${'x'.repeat(30_000)}FIM` })
    stop()
    expect(seen[0]!.output!.endsWith('FIM')).toBe(true)
    expect(seen[0]!.output!.length).toBeLessThan(21_000)
  })
})
