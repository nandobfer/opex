import { describe, expect, it } from 'vitest'
import {
  changedInto,
  currentSatisfies,
  formatWatchRemaining,
  matchesWatch,
  opexWatchInputSchema,
  wakeDisplay,
  wakeModelText,
  watchConditionText,
  watchEventSummary,
  watchPillText,
  type OpexWakeWatch,
  type OpexWatchEvent,
} from '@/features/opex-agent/watches'

/** Regras puras da observação de eventos (OPE-194): schema, casamento evento → condição e textos. */

const task = { kind: 'task' as const, id: 't1' }
const moved = (from: string, to: string, done = false): OpexWatchEvent => ({ kind: 'task', id: 't1', label: 'OPE-12', from: { key: from, name: from }, to: { key: to, name: to }, done })
const cond = (event: string, values: string[] = []) => ({ event: event as never, values, labels: [] })
const format = (date: Date) => date.toISOString()

describe('schema da assinatura', () => {
  const base = { target: { kind: 'task', ref: 'OPE-12' }, event: 'done', note: 'Avise o dono' }
  it('aceita a entrada mínima e confere o par alvo × evento', () => {
    expect(opexWatchInputSchema.safeParse(base).success).toBe(true)
    const wrong = opexWatchInputSchema.safeParse({ ...base, event: 'deploy_finished' })
    expect(wrong.success).toBe(false)
    expect(wrong.error?.issues[0]?.message).toContain('Evento inválido para tarefa')
  })

  it('exige values nos eventos que pedem e valida etapas e status', () => {
    expect(opexWatchInputSchema.safeParse({ ...base, event: 'column_in' }).success).toBe(false)
    expect(opexWatchInputSchema.safeParse({ ...base, event: 'column_in', values: ['done'] }).success).toBe(true)
    expect(opexWatchInputSchema.safeParse({ target: { kind: 'workbench', ref: 'x' }, event: 'stage_in', values: ['preview', 'inventada'], note: 'n' }).success).toBe(false)
    expect(opexWatchInputSchema.safeParse({ target: { kind: 'routine_run', ref: 'x' }, event: 'status_in', values: ['done'], note: 'n' }).success).toBe(false)
    expect(opexWatchInputSchema.safeParse({ target: { kind: 'routine_run', ref: 'x' }, event: 'status_in', values: ['error'], note: 'n' }).success).toBe(true)
  })

  it('prazo entre 1 h e 30 dias e nota obrigatória', () => {
    expect(opexWatchInputSchema.safeParse({ ...base, expiresInHours: 721 }).success).toBe(false)
    expect(opexWatchInputSchema.safeParse({ ...base, expiresInHours: 720 }).success).toBe(true)
    expect(opexWatchInputSchema.safeParse({ ...base, note: ' ' }).success).toBe(false)
  })
})

describe('matchesWatch', () => {
  it('tarefa: done só na coluna de conclusão, column_in pelas chaves, column_changed em qualquer mudança', () => {
    expect(matchesWatch(task, cond('done'), moved('doing', 'done', true))).toBe(true)
    expect(matchesWatch(task, cond('done'), moved('doing', 'review'))).toBe(false)
    expect(matchesWatch(task, cond('column_in', ['review']), moved('doing', 'review'))).toBe(true)
    expect(matchesWatch(task, cond('column_changed'), moved('doing', 'doing'))).toBe(false)
    expect(matchesWatch(task, cond('archived'), { kind: 'task', id: 't1', label: 'OPE-12', archived: true })).toBe(true)
  })

  it('outro alvo não casa; exclusão casa com qualquer condição', () => {
    expect(matchesWatch({ kind: 'task', id: 'outro' }, cond('column_changed'), moved('a', 'b'))).toBe(false)
    expect(matchesWatch(task, cond('done'), { kind: 'task', id: 't1', label: 'OPE-12', deleted: true })).toBe(true)
  })

  it('mesa: waiting_user ao entrar numa etapa de espera; failed pelo runState', () => {
    const wb = { kind: 'workbench' as const, id: 'w1' }
    expect(matchesWatch(wb, cond('waiting_user'), { kind: 'workbench', id: 'w1', label: 'OPE-1', stage: 'preview', previousStage: 'building' })).toBe(true)
    expect(matchesWatch(wb, cond('waiting_user'), { kind: 'workbench', id: 'w1', label: 'OPE-1', stage: 'preview', previousStage: 'preview' })).toBe(false)
    expect(matchesWatch(wb, cond('waiting_user'), { kind: 'workbench', id: 'w1', label: 'OPE-1', stage: 'implementing' })).toBe(false)
    expect(matchesWatch(wb, cond('failed'), { kind: 'workbench', id: 'w1', label: 'OPE-1', runState: 'failed' })).toBe(true)
    expect(matchesWatch(wb, cond('done'), { kind: 'workbench', id: 'w1', label: 'OPE-1', stage: 'done', previousStage: 'pr_open' })).toBe(true)
  })

  it('execução, job e deploy pelo status', () => {
    expect(matchesWatch({ kind: 'routine_run', id: 'r' }, cond('finished'), { kind: 'routine_run', id: 'r', label: 'A', status: 'error' })).toBe(true)
    expect(matchesWatch({ kind: 'routine_run', id: 'r' }, cond('finished'), { kind: 'routine_run', id: 'r', label: 'A', status: 'awaiting_confirmation' })).toBe(false)
    expect(matchesWatch({ kind: 'routine_run', id: 'r' }, cond('status_in', ['awaiting_confirmation']), { kind: 'routine_run', id: 'r', label: 'A', status: 'awaiting_confirmation' })).toBe(true)
    expect(matchesWatch({ kind: 'job', id: 'j' }, cond('finished'), { kind: 'job', id: 'j', label: 'J', status: 'canceled' })).toBe(true)
    expect(matchesWatch({ kind: 'environment', id: 'e' }, cond('deploy_finished'), { kind: 'environment', id: 'e', label: 'E', status: 'failed' })).toBe(true)
  })
})

describe('currentSatisfies', () => {
  it('lê o estado atual uma vez; deploy e "qualquer mudança" sempre esperam o próximo', () => {
    expect(currentSatisfies('task', cond('done'), { done: true })).toBe(true)
    expect(currentSatisfies('task', cond('column_changed'), { columnKey: 'x' })).toBe(false)
    expect(currentSatisfies('workbench', cond('waiting_user'), { stage: 'plan_review' })).toBe(true)
    expect(currentSatisfies('routine_run', cond('finished'), { status: 'running' })).toBe(false)
    expect(currentSatisfies('environment', cond('deploy_finished'), {})).toBe(false)
  })
})

describe('changedInto (janela da assinatura)', () => {
  const target = { kind: 'task' as const, id: 't1', label: 'OPE-12' }
  it('mudança de coluna entre as leituras casa com "qualquer mudança" e com a coluna escolhida; sem mudança, não', () => {
    expect(changedInto(target, cond('column_changed'), { columnKey: 'doing' }, { columnKey: 'review' })).toBe(true)
    expect(changedInto(target, cond('column_in', ['review']), { columnKey: 'doing' }, { columnKey: 'review' })).toBe(true)
    expect(changedInto(target, cond('column_changed'), { columnKey: 'doing' }, { columnKey: 'doing' })).toBe(false)
  })
  it('mesa e status pelo valor novo', () => {
    expect(changedInto({ kind: 'workbench', id: 'w', label: 'OPE-1' }, cond('waiting_user'), { stage: 'building' }, { stage: 'preview' })).toBe(true)
    expect(changedInto({ kind: 'job', id: 'j', label: 'J' }, cond('finished'), { status: 'running' }, { status: 'done' })).toBe(true)
    expect(changedInto({ kind: 'job', id: 'j', label: 'J' }, cond('finished'), { status: 'running' }, { status: 'running' })).toBe(false)
  })
})

describe('textos', () => {
  const watch = (patch: Partial<OpexWakeWatch> = {}): OpexWakeWatch => ({
    id: 'w1',
    target: { kind: 'task', id: 't1', label: 'OPE-12' },
    condition: { event: 'done', values: [], labels: [] },
    note: 'Avise o dono',
    outcome: 'event',
    event: { summary: watchEventSummary(moved('Revisão', 'Concluído', true)), short: 'OPE-12 foi para Concluído', at: new Date('2026-11-25T15:02:00Z') },
    createdAt: new Date('2026-11-25T14:40:00Z'),
    expiresAt: new Date('2026-11-26T14:40:00Z'),
    ...patch,
  })

  it('pílula e condição em pt-BR', () => {
    expect(watchPillText({ kind: 'task', label: 'OPE-12' }, { event: 'done', values: [], labels: [] })).toBe('Observando tarefa OPE-12 · chegar na coluna de conclusão')
    expect(watchConditionText('workbench', { event: 'stage_in', values: ['preview'], labels: [] })).toBe('entrar em "Prévia pronta"')
  })

  it('o texto que acorda vem como lembrete de sistema, com o fato, a nota e a regra de não agendar job', () => {
    const text = wakeModelText([watch()], format)
    expect(text.startsWith('<system-reminder>')).toBe(true)
    expect(text).toContain('[NOTIFICAÇÃO DO SISTEMA · observação w1]')
    expect(text).toContain('Evento: A tarefa OPE-12 mudou de coluna: "Revisão" → "Concluído" (coluna de conclusão).')
    expect(text).toContain('O que você combinou fazer: Avise o dono')
    expect(text).toContain('não agende job')
    expect(wakeDisplay([watch()])).toBe('Evento · OPE-12 foi para Concluído')
  })

  it('expirada e alvo excluído têm frases próprias; várias viram uma notificação só', () => {
    expect(wakeModelText([watch({ outcome: 'expired', event: null })], format)).toContain('venceu')
    expect(wakeDisplay([watch({ outcome: 'expired', event: null })])).toBe('Observação expirada · OPE-12')
    expect(wakeDisplay([watch({ outcome: 'target_deleted' })])).toBe('Alvo excluído · tarefa OPE-12')
    expect(wakeDisplay([watch(), watch({ id: 'w2', outcome: 'expired' })])).toMatch(/^2 notificações do sistema · /)
  })

  it('prazo restante curto', () => {
    const now = new Date('2026-11-25T12:00:00Z')
    expect(formatWatchRemaining(new Date(now.getTime() + 23 * 3_600_000), now)).toBe('23 h')
    expect(formatWatchRemaining(new Date(now.getTime() + 12 * 60_000), now)).toBe('12 min')
    expect(formatWatchRemaining(new Date(now.getTime() + 5 * 86_400_000), now)).toBe('5 dias')
  })
})
