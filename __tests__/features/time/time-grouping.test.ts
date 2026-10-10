import { describe, expect, it } from 'vitest'
import type { TimeLogDto } from '@/features/time/types'
import { groupTimeLogsByTask } from '@/features/time/grouping'

const log = (overrides: Partial<TimeLogDto> = {}): TimeLogDto => ({
  id: Math.random().toString(16).slice(2).padEnd(24, '0'),
  taskId: 'a'.repeat(24),
  workbenchId: 'wb-1',
  taskCode: 'OPX-1',
  taskTitle: 'Primeira',
  stage: 'implementing',
  agent: 'build',
  model: 'openai/gpt',
  startTime: '2026-10-10T10:00:00.000Z',
  endTime: '2026-10-10T10:30:00.000Z',
  duration: 30,
  costUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  description: null,
  active: false,
  ...overrides,
})

describe('groupTimeLogsByTask', () => {
  it('agrupa por task, soma os minutos encerrados e ordena itens e grupos pelo início mais recente', () => {
    const taskA = 'a'.repeat(24)
    const taskB = 'b'.repeat(24)
    const groups = groupTimeLogsByTask([
      log({ taskId: taskA, taskCode: 'OPX-1', startTime: '2026-10-10T09:00:00.000Z', duration: 15 }),
      log({ taskId: taskB, taskCode: 'OPX-2', taskTitle: 'Segunda', startTime: '2026-10-10T11:00:00.000Z', duration: null, active: true, endTime: null }),
      log({ taskId: taskA, taskCode: 'OPX-1', startTime: '2026-10-10T10:00:00.000Z', duration: 30 }),
    ])

    expect(groups.map((group) => group.key)).toEqual([taskB, taskA])

    const [first, second] = groups
    expect(first).toMatchObject({ taskId: taskB, taskCode: 'OPX-2', totalMinutes: 0, hasActive: true })
    expect(first.logs.map((l) => l.startTime)).toEqual(['2026-10-10T11:00:00.000Z'])

    expect(second).toMatchObject({ taskId: taskA, taskCode: 'OPX-1', totalMinutes: 45, hasActive: false })
    expect(second.logs.map((l) => l.startTime)).toEqual(['2026-10-10T10:00:00.000Z', '2026-10-10T09:00:00.000Z'])
  })

  it('não soma os minutos de períodos ativos (duração nula) e sinaliza o grupo ativo', () => {
    const groups = groupTimeLogsByTask([log({ duration: null, active: true, endTime: null })])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ totalMinutes: 0, hasActive: true })
  })

  it('mantém title/código nulos (tarefa sem rótulo) no grupo', () => {
    const groups = groupTimeLogsByTask([log({ taskCode: null, taskTitle: null })])
    expect(groups[0]).toMatchObject({ taskCode: null, taskTitle: null })
  })

  it('sem apontamentos devolve lista vazia', () => {
    expect(groupTimeLogsByTask([])).toEqual([])
  })

  it('soma os tokens (entrada + saída + raciocínio) e o custo do grupo', () => {
    const groups = groupTimeLogsByTask([
      log({ inputTokens: 100, outputTokens: 20, reasoningTokens: 5, costUsd: 0.25 }),
      log({ startTime: '2026-10-10T11:00:00.000Z', inputTokens: 30, outputTokens: 10, reasoningTokens: 0, costUsd: 0.1 }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].totalTokens).toBe(165)
    expect(groups[0].totalCostUsd).toBeCloseTo(0.35)
  })

  it('zera tokens e custo no grupo sem uso', () => {
    const groups = groupTimeLogsByTask([log()])
    expect(groups[0]).toMatchObject({ totalTokens: 0, totalCostUsd: 0 })
  })
})
