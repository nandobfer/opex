import { describe, expect, it } from 'vitest'
import { assigneesOf, DEFAULT_DEV_CENTER_FILTERS, filterCentralTasks, UNASSIGNED } from '@/features/agentic/dev-center-filters'
import type { TaskDto } from '@/features/tasks/types'

const task = (patch: Partial<TaskDto>): TaskDto => ({
  id: 't',
  code: 'GO-DEV-1',
  title: 'Tarefa',
  status: 'development',
  order: 0,
  taskType: null,
  priority: 'medium',
  product: { id: 'p1', name: 'Portal' },
  workPackage: null,
  assignee: null,
  commitUrl: null,
  pullRequestUrl: null,
  archived: false,
  createdAt: null,
  updatedAt: null,
  ...patch,
} as TaskDto)

const tasks = [
  task({ id: 'a', code: 'GO-DEV-1', title: 'Relatório de ações', status: 'development', assignee: { id: 'u1', name: 'Ana', email: null } }),
  task({ id: 'b', code: 'GO-DEV-2', title: 'Login', status: 'backlog' }),
  task({ id: 'c', code: 'GO-DEV-3', title: 'Deploy', status: 'in_production' }),
  task({ id: 'd', code: 'GO-DEV-4', title: 'Outro produto', product: { id: 'p2', name: 'X' } }),
]

describe('filterCentralTasks', () => {
  it('só tarefas do produto, sem Em Produção por padrão, na ordem do fluxo', () => {
    expect(filterCentralTasks(tasks, 'p1', DEFAULT_DEV_CENTER_FILTERS).map((item) => item.id)).toEqual(['b', 'a'])
  })

  it('busca sem acento por código ou título e filtra responsável', () => {
    expect(filterCentralTasks(tasks, 'p1', { ...DEFAULT_DEV_CENTER_FILTERS, search: 'relatorio acoes' }).map((item) => item.id)).toEqual(['a'])
    expect(filterCentralTasks(tasks, 'p1', { ...DEFAULT_DEV_CENTER_FILTERS, search: 'dev-2' }).map((item) => item.id)).toEqual(['b'])
    expect(filterCentralTasks(tasks, 'p1', { ...DEFAULT_DEV_CENTER_FILTERS, assignee: UNASSIGNED }).map((item) => item.id)).toEqual(['b'])
    expect(filterCentralTasks(tasks, 'p1', { ...DEFAULT_DEV_CENTER_FILTERS, assignee: 'u1' }).map((item) => item.id)).toEqual(['a'])
  })

  it('sem status selecionado mostra todos', () => {
    expect(filterCentralTasks(tasks, 'p1', { ...DEFAULT_DEV_CENTER_FILTERS, statuses: [] })).toHaveLength(3)
  })

  it('assigneesOf lista os responsáveis do produto', () => {
    expect(assigneesOf(tasks, 'p1')).toEqual([{ id: 'u1', name: 'Ana' }])
  })
})
