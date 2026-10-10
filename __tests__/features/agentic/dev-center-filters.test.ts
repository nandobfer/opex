import { describe, expect, it } from 'vitest'
import { DEFAULT_DEV_CENTER_FILTERS, filterCentralTasks } from '@/features/agentic/dev-center-filters'
import type { TaskDto } from '@/features/tasks/types'

const task = (patch: Partial<TaskDto>): TaskDto =>
  ({
    id: 't',
    code: 'OPX-1',
    columnId: 'todo',
    order: 0,
    title: 'Tarefa',
    taskType: null,
    priority: 'medium',
    archived: false,
    project: { id: 'p1', name: 'Portal', repo: 'org/portal', sigla: 'POR' },
    createdAt: null,
    updatedAt: null,
    ...patch,
  }) as TaskDto

const tasks = [
  task({ id: 'a', code: 'OPX-1', title: 'Relatório de ações', columnId: 'doing', order: 2 }),
  task({ id: 'b', code: 'OPX-2', title: 'Login', columnId: 'todo', order: 1 }),
  task({ id: 'c', code: 'OPX-3', title: 'Deploy', columnId: 'done', order: 3 }),
  task({ id: 'd', code: 'OPX-4', title: 'Outro projeto', project: { id: 'p2', name: 'X', repo: 'org/x', sigla: 'X' } }),
]

describe('filterCentralTasks', () => {
  it('só tarefas do projeto, na ordem do quadro', () => {
    expect(filterCentralTasks(tasks, 'p1', DEFAULT_DEV_CENTER_FILTERS).map((item) => item.id)).toEqual(['b', 'a', 'c'])
  })

  it('busca sem acento por código ou título', () => {
    expect(filterCentralTasks(tasks, 'p1', { ...DEFAULT_DEV_CENTER_FILTERS, search: 'relatorio acoes' }).map((item) => item.id)).toEqual(['a'])
    expect(filterCentralTasks(tasks, 'p1', { ...DEFAULT_DEV_CENTER_FILTERS, search: 'opx-2' }).map((item) => item.id)).toEqual(['b'])
  })

  it('filtra por coluna', () => {
    expect(filterCentralTasks(tasks, 'p1', { ...DEFAULT_DEV_CENTER_FILTERS, columns: ['todo'] }).map((item) => item.id)).toEqual(['b'])
  })

  it('ignora tarefas arquivadas', () => {
    expect(filterCentralTasks([...tasks, task({ id: 'e', archived: true })], 'p1', DEFAULT_DEV_CENTER_FILTERS).map((item) => item.id)).toEqual(['b', 'a', 'c'])
  })
})
