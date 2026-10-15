import { describe, expect, it } from 'vitest'
import { applyTimelineLine, INITIAL_TIMELINE, splitNdjson, type TimelineState } from '@/features/agentic/timeline'
import type { WorkbenchStreamLine } from '@/features/agentic/types'

const ts = '2026-10-09T12:00:00.000Z'
const run = (lines: WorkbenchStreamLine[]): TimelineState => lines.reduce(applyTimelineLine, INITIAL_TIMELINE)

describe('applyTimelineLine', () => {
  it('reset marca carregado; textos seguidos viram um bloco', () => {
    const state = run([{ type: 'reset' }, { type: 'turn', stage: 'planning', title: 'Planejando', agent: 'plan', model: null, seq: 1, ts }, { type: 'text', text: 'Ol', seq: 2, ts }, { type: 'text', text: 'á', seq: 3, ts }])
    expect(state.loaded).toBe(true)
    expect(state.items.map((item) => item.kind)).toEqual(['turn', 'text'])
    expect(state.items[1]).toMatchObject({ text: 'Olá' })
  })

  it('ferramenta é atualizada pelo id (progresso ao vivo e fim)', () => {
    const state = run([
      { type: 'reset' },
      { type: 'tool', id: 't1', name: 'bash', state: 'running', input: 'docker compose up', seq: 1, ts },
      { type: 'tool-progress', id: 't1', output: 'building…', ts },
      { type: 'tool', id: 't1', name: 'bash', state: 'done', output: 'ok', seq: 2, ts },
    ])
    expect(state.items).toHaveLength(1)
    expect(state.items[0]).toMatchObject({ state: 'done', input: 'docker compose up', output: 'ok' })
  })

  it('fim do turno, permissão respondida e pergunta fechada', () => {
    const state = run([
      { type: 'reset' },
      { type: 'turn', stage: 'building', title: 'Subindo', agent: null, model: null, seq: 1, ts },
      { type: 'permission', permission: { id: 'p1', action: 'bash', resources: [], message: null }, seq: 2, ts },
      { type: 'permission-replied', id: 'p1', decision: 'once', seq: 3, ts },
      { type: 'form', form: { id: 'f1', title: 'Pergunta', fields: [] }, seq: 4, ts },
      { type: 'form-closed', id: 'f1', seq: 5, ts },
      { type: 'turn-end', outcome: 'failed', message: 'erro', durationMs: 10, costUsd: 0, seq: 6, ts },
    ])
    expect(state.items[0]).toMatchObject({ kind: 'turn', end: { outcome: 'failed', message: 'erro' } })
    expect(state.items[1]).toMatchObject({ kind: 'permission', decision: 'once' })
    expect(state.items[2]).toMatchObject({ kind: 'form', closed: true })
  })

  it('raciocínio some quando chega texto; um novo reset limpa tudo', () => {
    const thinking = run([{ type: 'reset' }, { type: 'reasoning', ts }])
    expect(thinking.reasoning).toBe(true)
    expect(applyTimelineLine(thinking, { type: 'text', text: 'x', seq: 1, ts }).reasoning).toBe(false)
    expect(applyTimelineLine(run([{ type: 'reset' }, { type: 'text', text: 'x', seq: 1, ts }]), { type: 'reset' }).items).toEqual([])
  })

  it('pergunta/permissão reenviadas (reconexão) atualizam o item pelo id, sem duplicar', () => {
    const state = run([
      { type: 'reset' },
      { type: 'form', form: { id: 'f1', title: 'Pergunta', fields: [] }, seq: 1, ts },
      { type: 'form-closed', id: 'f1', seq: 2, ts },
      { type: 'form', form: { id: 'f1', title: 'Pergunta (relida)', fields: [] }, seq: 3, ts },
      { type: 'permission', permission: { id: 'p1', action: 'bash', resources: [], message: null }, seq: 4, ts },
      { type: 'permission', permission: { id: 'p1', action: 'bash', resources: ['x'], message: null }, seq: 5, ts },
    ])
    expect(state.items).toHaveLength(2)
    expect(state.items[0]).toMatchObject({ kind: 'form', form: { id: 'f1', title: 'Pergunta (relida)' }, closed: false })
    expect(state.items[1]).toMatchObject({ kind: 'permission', permission: { id: 'p1', resources: ['x'] }, decision: null })
  })
})

describe('splitNdjson', () => {
  it('separa linhas completas e guarda o resto', () => {
    const { lines, rest } = splitNdjson('{"type":"reset"}\n{"type":"ping","ts":"x"}\n{"type":"te')
    expect(lines.map((line) => line.type)).toEqual(['reset', 'ping'])
    expect(rest).toBe('{"type":"te')
  })
})
