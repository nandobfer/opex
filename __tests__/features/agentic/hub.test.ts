import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn() }))
vi.mock('@/lib/db/models/Agentic', () => ({ AgenticEvent: {} }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

import { coalesceEvents, publishWorkbenchEvent, subscribeWorkbench } from '@/features/agentic/server/hub'

const ts = '2026-10-09T12:00:00.000Z'

describe('hub da mesa', () => {
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

  it('corta a saída longa de ferramenta guardando o fim', () => {
    const seen: { output?: string }[] = []
    const stop = subscribeWorkbench('wb-clip', (event) => seen.push(event as { output?: string }))
    publishWorkbenchEvent('wb-clip', { type: 'tool', id: 't', name: 'bash', state: 'done', output: `${'x'.repeat(30_000)}FIM` })
    stop()
    expect(seen[0]!.output!.endsWith('FIM')).toBe(true)
    expect(seen[0]!.output!.length).toBeLessThan(21_000)
  })
})
