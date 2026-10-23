import { describe, expect, it } from 'vitest'
import { DEFAULT_DEV_CENTER_FILTERS, devCenterFiltersSchema, filterCentralTasks, isActiveWorkbench, matchesDevCenterState, type TaskWorkbenchState } from '@/features/agentic/dev-center-filters'
import type { WorkbenchStage } from '@/features/agentic/constants'
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
  it('mantém filtros legados e distingue desmarcar todas as colunas de mostrar todas', () => {
    const legacy = devCenterFiltersSchema.parse({ search: '', columns: [] })
    expect(legacy.states).toEqual([])
    expect(filterCentralTasks(tasks, 'p1', legacy)).toHaveLength(3)
    expect(filterCentralTasks(tasks, 'p1', { ...legacy, allColumns: false })).toHaveLength(0)
    expect(filterCentralTasks(tasks, 'p1', { ...legacy, allColumns: true })).toHaveLength(3)
  })

  it('Todos os projetos agrega somente projetos com central e busca no resumo', () => {
    expect(filterCentralTasks(tasks, ['p1', 'p2'], DEFAULT_DEV_CENTER_FILTERS)).toHaveLength(4)
    expect(filterCentralTasks([task({ summary: 'Configuração avançada' })], 'p1', { ...DEFAULT_DEV_CENTER_FILTERS, search: 'configuracao avancada' })).toHaveLength(1)
  })

  it('estados combinam por OU e continuam respeitando as colunas', () => {
    const status = (item: TaskDto): TaskWorkbenchState => item.id === 'a' ? { workbench: { stage: 'implementing', runState: 'running', pendingForms: 0, pendingPermissions: 0 } } : {}
    expect(filterCentralTasks(tasks, 'p1', { ...DEFAULT_DEV_CENTER_FILTERS, columns: ['doing'], states: ['running', 'no_workbench'] }, status).map((item) => item.id)).toEqual(['a'])
  })

  it('"Só mesas ativas": toda mesa não concluída (inclusive PR aberto, falha e aguardando vaga); sem mesa, fila e Concluída ficam de fora', () => {
    const wb = (stage: WorkbenchStage, patch: Partial<NonNullable<TaskWorkbenchState['workbench']>> = {}): TaskWorkbenchState => ({ workbench: { stage, runState: 'idle', pendingForms: 0, pendingPermissions: 0, ...patch } })
    const list = [...tasks, task({ id: 'e', order: 5 }), task({ id: 'f', order: 6 }), task({ id: 'g', order: 7 })]
    const states: Record<string, TaskWorkbenchState> = {
      a: wb('pr_open'),
      b: wb('implementing', { runState: 'failed' }),
      c: wb('done'),
      e: { queued: true },
      f: wb('plan_review', { slotQueue: { position: 1 } }),
    }
    const stateOf = (item: TaskDto) => states[item.id] ?? {}
    const ids = (activeOnly: boolean) => filterCentralTasks(list, 'p1', { ...DEFAULT_DEV_CENTER_FILTERS, activeOnly }, stateOf).map((item) => item.id)
    expect(ids(false)).toEqual(['b', 'a', 'c', 'e', 'f', 'g'])
    expect(ids(true)).toEqual(['b', 'a', 'f'])
    expect(isActiveWorkbench({})).toBe(false)
  })

  it('"Só mesas ativas" combina (E) com colunas, estado da mesa e busca; filtros salvos antes da chave ficam desligados', () => {
    const active: TaskWorkbenchState = { workbench: { stage: 'pr_open', runState: 'idle', pendingForms: 0, pendingPermissions: 0 } }
    const stateOf = (item: TaskDto): TaskWorkbenchState => (item.id === 'd' ? {} : active)
    const ids = (patch: Partial<typeof DEFAULT_DEV_CENTER_FILTERS>) => filterCentralTasks(tasks, 'p1', { ...DEFAULT_DEV_CENTER_FILTERS, activeOnly: true, ...patch }, stateOf).map((item) => item.id)
    expect(ids({ columns: ['doing'] })).toEqual(['a'])
    expect(ids({ search: 'login' })).toEqual(['b'])
    expect(ids({ states: ['no_workbench'] })).toEqual([])
    expect(devCenterFiltersSchema.parse({ search: '', columns: [] }).activeOnly).toBe(false)
  })

  it('Na fila inclui retomadas aguardando vaga e distingue Sem mesa', () => {
    expect(matchesDevCenterState('central_queue', { queued: true })).toBe(true)
    const queued: TaskWorkbenchState = { workbench: { stage: 'plan_review', runState: 'idle', pendingForms: 0, pendingPermissions: 0, slotQueue: { position: 1 } } }
    expect(matchesDevCenterState('central_queue', queued)).toBe(true)
    expect(matchesDevCenterState('needs_interaction', queued)).toBe(false)
    expect(matchesDevCenterState('no_workbench', queued)).toBe(false)
  })

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
