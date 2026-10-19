import { describe, expect, it } from 'vitest'
import { applyTimelineLine, INITIAL_TIMELINE, latestPrWatch, nextPrWatchAt, type TimelineState } from '@/features/agentic/timeline'
import type { WorkbenchStreamLine } from '@/features/agentic/types'

const ts = '2026-10-16T12:00:00.000Z'
const run = (lines: WorkbenchStreamLine[], from: TimelineState = INITIAL_TIMELINE): TimelineState => lines.reduce(applyTimelineLine, from)

const step = (checkId: string, text: string): WorkbenchStreamLine => ({ type: 'pr-watch-step', checkId, prNumber: 7, level: 'info', text, ts })
const check = (checkId: string, outcome: 'idle' | 'action' | 'error', seq: number, summary = 'Nada a fazer'): WorkbenchStreamLine => ({
  type: 'pr-watch',
  checkId,
  prNumber: 7,
  startedAt: ts,
  steps: [{ ts, level: 'info', text: 'Consultando o PR #7 no GitHub…' }],
  outcome,
  summary,
  nextCheckAt: '2026-10-16T12:02:00.000Z',
  seq,
  ts,
})

describe('timeline: verificação do PR', () => {
  it('passos ao vivo montam um bloco em andamento; a verificação gravada o substitui no lugar', () => {
    const live = run([{ type: 'reset' }, step('a', 'Consultando o PR #7 no GitHub…'), step('a', 'Sem conflito de merge')])
    expect(live.items).toHaveLength(1)
    expect(live.items[0]).toMatchObject({ kind: 'pr-watch', checkId: 'a', outcome: null, summary: null })
    expect((live.items[0] as { steps: unknown[] }).steps).toHaveLength(2)

    const done = run([check('a', 'idle', 1)], live)
    expect(done.items).toHaveLength(1)
    expect(done.items[0]).toMatchObject({ key: 'prw-a', outcome: 'idle', summary: 'Nada a fazer', nextCheckAt: '2026-10-16T12:02:00.000Z' })
    // Passo atrasado depois do fechamento é ignorado.
    expect(run([step('a', 'tarde')], done).items[0]).toEqual(done.items[0])
  })

  it('verificação sem novidade substitui as anteriores sem novidade; as que encontraram algo ficam', () => {
    const state = run([
      { type: 'reset' },
      check('a', 'idle', 1),
      check('b', 'action', 2, 'Pedido de mudança → replanejando'),
      { type: 'notice', level: 'info', message: 'x', seq: 3, ts },
      check('c', 'idle', 4),
      step('d', 'Consultando o PR #7 no GitHub…'),
      check('d', 'idle', 5),
    ])
    const checks = state.items.filter((item) => item.kind === 'pr-watch')
    expect(checks.map((item) => (item as { checkId: string }).checkId)).toEqual(['b', 'd'])
    expect(latestPrWatch(state.items)).toMatchObject({ checkId: 'd' })
  })

  it('nextPrWatchAt escolhe o horário mais recente válido', () => {
    expect(nextPrWatchAt(null, undefined)).toBeNull()
    expect(nextPrWatchAt('2026-10-16T12:02:00.000Z', '2026-10-16T12:04:00.000Z', 'lixo')).toBe('2026-10-16T12:04:00.000Z')
    expect(nextPrWatchAt('2026-10-16T12:02:00.000Z', null)).toBe('2026-10-16T12:02:00.000Z')
  })
})
