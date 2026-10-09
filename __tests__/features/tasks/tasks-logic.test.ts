import { describe, expect, it } from 'vitest'
import { isValidCommitUrl, isValidPullRequestUrl, requiredUrlFor, UNASSIGNED } from '@/features/tasks/constants'
import { computeDropOrderInList, sortTasks } from '@/features/tasks/ordering'
import { finalDropPosition, moveBetweenColumns } from '@/features/tasks/drop-target'
import { applyTaskFilters, DEFAULT_TASK_FILTERS, taskFiltersSchema, visibleColumns, type TaskFilters } from '@/features/tasks/filters'
import { buildBoardColumns } from '@/features/tasks/board'
import { toTaskDetailDto, toTaskDto, toTaskList } from '@/features/tasks/server/mappers'
import { diffSignatures } from '@/features/tasks/server/sync'
import type { TaskDto } from '@/features/tasks/types'

const task = (overrides: Partial<TaskDto>): TaskDto => ({
  id: 'a'.repeat(24),
  code: 'GO-DEV-1',
  title: 'Tarefa',
  status: 'backlog',
  order: 0,
  taskType: 'feature',
  priority: 'medium',
  product: { id: 'p1', name: 'GO' },
  workPackage: null,
  assignee: null,
  commitUrl: null,
  pullRequestUrl: null,
  archived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  ...overrides,
})

describe('regras de transição (iguais às do Go! Sipal)', () => {
  it('Validação pede commit e Aguardando Produção pede PR; tipos sem código não pedem', () => {
    expect(requiredUrlFor(task({}), 'validation')).toBe('commit')
    expect(requiredUrlFor(task({}), 'awaiting_production')).toBe('pullRequest')
    expect(requiredUrlFor(task({}), 'development')).toBeNull()
    expect(requiredUrlFor(task({ taskType: 'analysis' }), 'validation')).toBeNull()
    expect(requiredUrlFor(task({ commitUrl: 'https://github.com/o/r/commit/abc123' }), 'validation')).toBeNull()
    expect(requiredUrlFor(task({ commitUrl: 'https://exemplo.com' }), 'validation')).toBe('commit')
  })

  it('valida links de commit e de PR', () => {
    expect(isValidCommitUrl('https://github.com/o/r/commit/abc123')).toBe(true)
    expect(isValidCommitUrl('https://bitbucket.org/o/r/commits/abc123')).toBe(true)
    expect(isValidCommitUrl('https://github.com/o/r/pull/1')).toBe(false)
    expect(isValidPullRequestUrl('https://github.com/o/r/pull/12')).toBe(true)
    expect(isValidPullRequestUrl('https://gitlab.com/o/r/-/merge_requests/3')).toBe(true)
    expect(isValidPullRequestUrl('https://github.com/o/r/commit/abc')).toBe(false)
  })
})

describe('ordenação e posição ao soltar', () => {
  it('ordena por prioridade, manual e data', () => {
    const list = [task({ id: '1', priority: 'low', order: 0 }), task({ id: '2', priority: 'urgent', order: 5 }), task({ id: '3', priority: 'urgent', order: 1 })]
    expect(sortTasks(list, 'priority').map((t) => t.id)).toEqual(['3', '2', '1'])
    expect(sortTasks(list, 'manual').map((t) => t.id)).toEqual(['1', '3', '2'])
  })

  it('ponto médio entre vizinhos, com empate de ordem', () => {
    expect(computeDropOrderInList([0, 10], 1)).toBe(5)
    expect(computeDropOrderInList([0, 10], 0)).toBe(-1)
    expect(computeDropOrderInList([0, 10], 2)).toBe(11)
    expect(computeDropOrderInList([3, 3, 7], 1)).toBe(5)
    expect(computeDropOrderInList([], 0)).toBe(0)
  })

  it('arraste: o card entra na coluna de destino durante o arraste (abre espaço) e a posição final dá a ordem', () => {
    const a = task({ id: 'a', order: 0 })
    const b = task({ id: 'b', order: 10 })
    const c = task({ id: 'c', status: 'development', order: 0 })
    const d = task({ id: 'd', status: 'development', order: 4 })
    const byId = new Map([a, b, c, d].map((t) => [t.id, t]))
    const original = { backlog: ['a', 'b'], development: ['c', 'd'] }

    const over = moveBetweenColumns(original, 'a', 'backlog', 'development', 'd', false)
    expect(over).toEqual({ backlog: ['b'], development: ['c', 'a', 'd'] })
    expect(moveBetweenColumns(original, 'a', 'backlog', 'development', 'd', true).development).toEqual(['c', 'd', 'a'])
    expect(moveBetweenColumns(original, 'a', 'backlog', 'development', 'drop:development', false).development).toEqual(['c', 'd', 'a'])

    expect(finalDropPosition(over, original, a, 'development', 'a', 'manual', byId)).toEqual({ items: over, order: 2 })
    expect(finalDropPosition(over, original, a, 'development', 'a', 'priority', byId)).toEqual({ items: over })
    // Mesma coluna: só na ordenação Manual e só se a posição mudou.
    expect(finalDropPosition(original, original, a, 'backlog', 'b', 'manual', byId)).toEqual({ items: { ...original, backlog: ['b', 'a'] }, order: 11 })
    expect(finalDropPosition(original, original, a, 'backlog', 'b', 'priority', byId)).toBeNull()
    expect(finalDropPosition(original, original, a, 'backlog', 'a', 'manual', byId)).toBeNull()
  })
})

describe('filtros', () => {
  const tasks = [
    task({ id: '1', code: 'GO-DEV-101', title: 'Ajustar login', assignee: { id: 'u1', name: 'Fer', email: null } }),
    task({ id: '2', code: 'GO-DEV-202', title: 'Relatório de vendas', status: 'development', priority: 'urgent', product: { id: 'p2', name: 'CRM' } }),
    task({ id: '3', code: 'GO-DEV-303', title: 'Antiga', archived: true, taskType: 'bugfix' }),
  ]
  const f = (overrides: Partial<TaskFilters>): TaskFilters => ({ ...DEFAULT_TASK_FILTERS, ...overrides })

  it('arquivadas só com o filtro; produto, responsável (inclusive sem responsável), prioridade, tipo', () => {
    expect(applyTaskFilters(tasks, f({})).map((t) => t.id)).toEqual(['1', '2'])
    expect(applyTaskFilters(tasks, f({ showArchived: true, types: ['bugfix'] })).map((t) => t.id)).toEqual(['3'])
    expect(applyTaskFilters(tasks, f({ products: ['p2'] })).map((t) => t.id)).toEqual(['2'])
    expect(applyTaskFilters(tasks, f({ assignees: [UNASSIGNED] })).map((t) => t.id)).toEqual(['2'])
    expect(applyTaskFilters(tasks, f({ assignees: ['u1'] })).map((t) => t.id)).toEqual(['1'])
    expect(applyTaskFilters(tasks, f({ priorities: ['urgent'] })).map((t) => t.id)).toEqual(['2'])
  })

  it('status filtra a tabela; no kanban vira colunas visíveis', () => {
    expect(applyTaskFilters(tasks, f({ statuses: ['development'] })).map((t) => t.id)).toEqual(['2'])
    expect(applyTaskFilters(tasks, f({ statuses: ['development'] }), { ignoreStatus: true })).toHaveLength(2)
    const columns = buildBoardColumns(undefined)
    expect(visibleColumns(columns, f({ statuses: ['in_production', 'backlog', 'custom-sumiu123'] })).map((c) => c.key)).toEqual(['backlog', 'in_production'])
    expect(visibleColumns(columns, f({}))).toHaveLength(7)
  })

  it('busca por código e por título com erro de digitação', () => {
    expect(applyTaskFilters(tasks, f({ search: 'go-dev-202' })).map((t) => t.id)).toEqual(['2'])
    expect(applyTaskFilters(tasks, f({ search: 'relatorio vendaz' })).map((t) => t.id)).toEqual(['2'])
  })

  it('o que vem do navegador é validado campo a campo (inválido volta ao padrão)', () => {
    const parsed = taskFiltersSchema.parse({ view: 'table', statuses: ['backlog', 3], sort: 'invalida', search: 3 })
    expect(parsed.view).toBe('table')
    expect(parsed.statuses).toEqual([])
    expect(parsed.sort).toBe('priority')
    expect(parsed.search).toBe('')
    expect(parsed.tableSort).toEqual(DEFAULT_TASK_FILTERS.tableSort)
  })
})

describe('normalização das respostas do Go! Sipal', () => {
  const raw = {
    _id: 'b'.repeat(24),
    taskId: 'GO-DEV-9',
    title: 'Card',
    status: 'validation',
    order: 3,
    taskType: 'feature',
    priority: 'high',
    product: { _id: 'p1', name: 'GO' },
    workPackage: { _id: 'w1', name: 'Sprint 1', startDate: '2026-01-01', endDate: null },
    assignee: { _id: 'u1', name: 'Fer', email: 'f@x' },
    isArchived: false,
    createdAt: '2026-01-01T10:00:00.000Z',
  }

  it('toTaskDto: campos do card; inválidos são descartados', () => {
    expect(toTaskDto(raw)).toMatchObject({ id: 'b'.repeat(24), code: 'GO-DEV-9', status: 'validation', priority: 'high', assignee: { id: 'u1', email: 'f@x' } })
    expect(toTaskDto({ ...raw, priority: 'xpto', taskType: 'outro' })).toMatchObject({ priority: 'medium', taskType: null })
    expect(toTaskList([raw, { _id: 'x', status: 'desconhecido' }, null])).toHaveLength(1)
  })

  it('toTaskDetailDto: comentários, histórico (mais recente primeiro), horas e link da plataforma', () => {
    const detail = toTaskDetailDto(
      {
        ...raw,
        description: '**oi**',
        acceptanceCriteria: ['a', '', 'b'],
        comments: [{ _id: 'c1', content: 'ok', author: { _id: 'u1', name: 'Fer' }, createdAt: '2026-01-02' }],
        history: [
          { _id: 'h1', action: 'created', description: 'Criada', createdAt: '2026-01-01' },
          { _id: 'h2', action: 'status_changed', description: 'Movida', createdAt: '2026-01-03' },
        ],
        timeLogs: [{ _id: 't1', duration: 90, isActive: false }],
        totalTimeLogged: 90,
        linkedImprovement: { improvementId: 'MEL-1', fase1: { titulo: 'Melhoria' } },
      },
      'https://go.sipal.com.br/',
    )
    expect(detail?.acceptanceCriteria).toEqual(['a', 'b'])
    expect(detail?.history.map((h) => h.id)).toEqual(['h2', 'h1'])
    expect(detail?.timeLogs[0]).toMatchObject({ duration: 90, active: false })
    expect(detail?.linkedImprovement).toEqual({ code: 'MEL-1', title: 'Melhoria' })
    expect(detail?.platformUrl).toBe(`https://go.sipal.com.br/dev-center?task=${'b'.repeat(24)}`)
  })
})

describe('sincronização', () => {
  it('diffSignatures: novas, alteradas e removidas', () => {
    expect(diffSignatures({ a: '1', b: '1', c: '1' }, { a: '1', b: '2', d: '1' }).sort()).toEqual(['b', 'c', 'd'])
    expect(diffSignatures({ a: '1' }, { a: '1' })).toEqual([])
  })
})
