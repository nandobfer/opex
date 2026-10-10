import { describe, expect, it } from 'vitest'
import { computeDropOrderInList, sortTasks } from '@/features/tasks/ordering'
import { finalDropPosition, moveBetweenColumns } from '@/features/tasks/drop-target'
import { applyTaskFilters, DEFAULT_TASK_FILTERS, taskFiltersSchema, taskRepoOptions, visibleColumns, type TaskFilters } from '@/features/tasks/filters'
import { buildBoardColumns, type TaskBoardDto } from '@/features/tasks/board'
import type { TaskDto } from '@/features/tasks/types'

const task = (overrides: Partial<TaskDto>): TaskDto => ({
  id: 'a'.repeat(24),
  code: 'OPX-1',
  columnId: 'todo',
  order: 0,
  title: 'Tarefa',
  taskType: 'feature',
  priority: 'medium',
  archived: false,
  project: { id: 'p1', name: 'GO', repo: 'o/go', sigla: 'GO' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  ...overrides,
})

describe('ordenação e posição ao soltar', () => {
  it('ordena por prioridade, manual e data', () => {
    const list = [task({ id: '1', priority: 'low', order: 0 }), task({ id: '2', priority: 'urgent', order: 5 }), task({ id: '3', priority: 'urgent', order: 1 })]
    expect(sortTasks(list, 'priority').map((t) => t.id)).toEqual(['3', '2', '1'])
    expect(sortTasks(list, 'manual').map((t) => t.id)).toEqual(['1', '3', '2'])
    expect(sortTasks(list, 'newest').map((t) => t.id)).toEqual(['1', '3', '2'])
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
    const c = task({ id: 'c', columnId: 'doing', order: 0 })
    const d = task({ id: 'd', columnId: 'doing', order: 4 })
    const byId = new Map([a, b, c, d].map((t) => [t.id, t]))
    const original = { todo: ['a', 'b'], doing: ['c', 'd'] }

    const over = moveBetweenColumns(original, 'a', 'todo', 'doing', 'd', false)
    expect(over).toEqual({ todo: ['b'], doing: ['c', 'a', 'd'] })
    expect(moveBetweenColumns(original, 'a', 'todo', 'doing', 'd', true).doing).toEqual(['c', 'd', 'a'])
    expect(moveBetweenColumns(original, 'a', 'todo', 'doing', 'drop:doing', false).doing).toEqual(['c', 'd', 'a'])

    expect(finalDropPosition(over, original, a, 'doing', 'a', 'manual', byId)).toEqual({ items: over, order: 2 })
    expect(finalDropPosition(over, original, a, 'doing', 'a', 'priority', byId)).toEqual({ items: over })
    expect(finalDropPosition(original, original, a, 'todo', 'b', 'manual', byId)).toEqual({ items: { ...original, todo: ['b', 'a'] }, order: 11 })
    expect(finalDropPosition(original, original, a, 'todo', 'b', 'priority', byId)).toBeNull()
    expect(finalDropPosition(original, original, a, 'todo', 'a', 'manual', byId)).toBeNull()
  })
})

describe('filtros', () => {
  const tasks = [
    task({ id: '1', code: 'OPX-101', title: 'Ajustar login' }),
    task({ id: '2', code: 'OPX-202', title: 'Relatório de vendas', columnId: 'doing', priority: 'urgent', project: { id: 'p2', name: 'CRM', repo: 'o/crm', sigla: 'CRM' } }),
    task({ id: '3', code: 'OPX-303', title: 'Antiga', archived: true, taskType: 'bugfix' }),
  ]
  const f = (overrides: Partial<TaskFilters>): TaskFilters => ({ ...DEFAULT_TASK_FILTERS, ...overrides })

  it('arquivadas só com o filtro; projeto, prioridade e tipo', () => {
    expect(applyTaskFilters(tasks, f({})).map((t) => t.id)).toEqual(['1', '2'])
    expect(applyTaskFilters(tasks, f({ showArchived: true, types: ['bugfix'] })).map((t) => t.id)).toEqual(['3'])
    expect(applyTaskFilters(tasks, f({ projects: ['p2'] })).map((t) => t.id)).toEqual(['2'])
    expect(applyTaskFilters(tasks, f({ priorities: ['urgent'] })).map((t) => t.id)).toEqual(['2'])
  })

  it('coluna filtra a tabela; no kanban vira colunas visíveis', () => {
    expect(applyTaskFilters(tasks, f({ columns: ['doing'] })).map((t) => t.id)).toEqual(['2'])
    expect(applyTaskFilters(tasks, f({ columns: ['doing'] }), { ignoreColumn: true })).toHaveLength(2)
    const board: TaskBoardDto = {
      columns: [
        { key: 'todo', name: 'A Fazer', color: 'zinc', icon: 'inbox', description: null, wipLimit: null },
        { key: 'doing', name: 'Em Andamento', color: 'sky', icon: 'clock', description: null, wipLimit: null },
      ],
      layout: ['todo', 'doing'],
    }
    const columns = buildBoardColumns(board)
    expect(visibleColumns(columns, f({ columns: ['doing', 'sumiu'] })).map((c) => c.key)).toEqual(['doing'])
    expect(visibleColumns(columns, f({}))).toHaveLength(2)
  })

  it('busca por código e por título com erro de digitação', () => {
    expect(applyTaskFilters(tasks, f({ search: 'opx-202' })).map((t) => t.id)).toEqual(['2'])
    expect(applyTaskFilters(tasks, f({ search: 'relatorio vendaz' })).map((t) => t.id)).toEqual(['2'])
  })

  it('opções do filtro Repositório: projetos vinculados + citados nas tarefas, sem duplicar, rótulo owner/repo', () => {
    const projects = [
      { id: 'p1', name: 'GO', repo: 'o/go', sigla: 'GO' },
      { id: 'p2', name: 'CRM', repo: 'o/crm', sigla: 'CRM' },
    ]
    // p3 só aparece numa tarefa (options ainda não carregou): não pode ficar de fora.
    const onlyInTask = task({ id: '2', project: { id: 'p3', name: 'Portal', repo: 'o/portal', sigla: 'POR' } })
    const options = taskRepoOptions(projects, [task({ id: '1' }), onlyInTask])
    expect(options.map((o) => o.label)).toEqual(['o/crm', 'o/go', 'o/portal'])
    expect(options.map((o) => o.value)).toEqual(['p2', 'p1', 'p3'])
    expect(options.filter((o) => o.value === 'p1')).toHaveLength(1)
  })

  it('o que vem do navegador é validado campo a campo (inválido volta ao padrão)', () => {
    const parsed = taskFiltersSchema.parse({ view: 'table', columns: ['todo', 3], sort: 'invalida', search: 3 })
    expect(parsed.view).toBe('table')
    expect(parsed.columns).toEqual([])
    expect(parsed.sort).toBe('priority')
    expect(parsed.search).toBe('')
    expect(parsed.tableSort).toEqual(DEFAULT_TASK_FILTERS.tableSort)
  })
})

describe('quadro', () => {
  it('buildBoardColumns segue a ordem salva e ignora chaves que sumiram', () => {
    const board: TaskBoardDto = {
      columns: [
        { key: 'todo', name: 'A Fazer', color: 'zinc', icon: 'inbox', description: null, wipLimit: null },
        { key: 'col-1', name: 'Custom', color: 'sky', icon: 'star', description: 'desc', wipLimit: 2 },
      ],
      layout: ['col-1', 'sumiu', 'todo'],
    }
    const columns = buildBoardColumns(board)
    expect(columns.map((c) => c.key)).toEqual(['col-1', 'todo'])
    expect(columns[0]).toMatchObject({ label: 'Custom', dot: 'bg-sky-400', column: { wipLimit: 2 } })
    expect(buildBoardColumns(undefined)).toEqual([])
  })
})
