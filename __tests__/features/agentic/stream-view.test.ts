import { describe, expect, it } from 'vitest'
import { applyStreamLines, streamViewFrom } from '@/features/agentic/stream-view'
import { applyTimelineLine, INITIAL_TIMELINE, type TimelineState } from '@/features/agentic/timeline'
import type { WorkbenchStreamLine } from '@/features/agentic/types'

/** OPE-188: saída exibida + carga em preparo (troca de uma vez no `ready`). */

const ts = '2026-11-26T12:00:00.000Z'
const text = (value: string, seq: number): WorkbenchStreamLine => ({ type: 'text', text: value, seq, ts })
const notice = (message: string, seq: number): WorkbenchStreamLine => ({ type: 'notice', level: 'info', message, seq, ts })
const shownTexts = (state: TimelineState) => state.items.map((item) => (item.kind === 'notice' ? item.message : item.kind === 'text' ? item.text : item.kind))

describe('applyStreamLines', () => {
  it('primeira visita é progressiva: o reset marca carregado e os itens aparecem conforme chegam', () => {
    const afterReset = applyStreamLines(streamViewFrom(null), [{ type: 'reset' }])
    expect(afterReset.shown.loaded).toBe(true)
    expect(afterReset.staging).toBeNull()
    const partial = applyStreamLines(afterReset, [notice('a', 1)])
    expect(shownTexts(partial.shown)).toEqual(['a'])
    expect(applyStreamLines(partial, [notice('b', 2), { type: 'ready' }]).shown.items).toHaveLength(2)
  })

  it('regressão: com a saída guardada, o reset não apaga a tela; a releitura troca no ready', () => {
    const cached = [notice('a', 1), notice('b', 2)].reduce(applyTimelineLine, { ...INITIAL_TIMELINE, loaded: true })
    const view = applyStreamLines(streamViewFrom(cached), [{ type: 'reset' }, notice('a', 1)])
    expect(view.shown).toBe(cached)
    expect(shownTexts(view.staging!)).toEqual(['a'])
    const done = applyStreamLines(view, [notice('b', 2), notice('c', 3), { type: 'ready' }])
    expect(done.staging).toBeNull()
    expect(shownTexts(done.shown)).toEqual(['a', 'b', 'c'])
  })

  it('depois do ready, o ao vivo vai direto para a saída exibida', () => {
    const cached = [notice('a', 1)].reduce(applyTimelineLine, { ...INITIAL_TIMELINE, loaded: true })
    const ready = applyStreamLines(streamViewFrom(cached), [{ type: 'reset' }, notice('a', 1), { type: 'ready' }])
    const live = applyStreamLines(ready, [text('Olá', 2)])
    expect(shownTexts(live.shown)).toEqual(['a', 'Olá'])
  })

  it('ping não troca a referência (não redesenha)', () => {
    const view = streamViewFrom({ ...INITIAL_TIMELINE, loaded: true })
    expect(applyStreamLines(view, [{ type: 'ping', ts }])).toBe(view)
  })
})
