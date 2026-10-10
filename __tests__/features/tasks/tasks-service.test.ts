import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  recordAudit: vi.fn(),
  publish: vi.fn(),
  models: {} as Record<string, { docs: unknown[]; create: (doc: Record<string, unknown>) => Promise<{ _id: string }>; aggregate: (...args: unknown[]) => Promise<unknown[]> }>,
}))

vi.mock('@/lib/db', () => ({
  dbConnect: vi.fn(),
  recordAudit: mocks.recordAudit,
  AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', MOVER: 'MOVER', EXCLUIR: 'EXCLUIR' },
}))
vi.mock('@/lib/pusher/channels', () => ({ appChannel: () => 'private-app', publishToChannels: mocks.publish }))
vi.mock('@/features/github/server/issue-links', () => ({ issueRefsFor: async () => new Map() }))
vi.mock('@/lib/db/models/DevTask', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  mocks.models.devTask = memoryModel()
  mocks.models.comment = memoryModel()
  return { DevTask: mocks.models.devTask, TaskComment: mocks.models.comment }
})
vi.mock('@/lib/db/models/Project', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  mocks.models.project = memoryModel()
  return { Project: mocks.models.project }
})
vi.mock('@/lib/db/models/TimeLog', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  mocks.models.timeLog = memoryModel()
  return { TimeLog: mocks.models.timeLog }
})
vi.mock('@/lib/db/models/TaskBoard', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  mocks.models.column = memoryModel()
  mocks.models.layout = memoryModel()
  return { TaskBoardColumn: mocks.models.column, TaskBoardLayout: mocks.models.layout }
})
vi.mock('@/lib/db/models/AuditLog', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  mocks.models.audit = memoryModel()
  return { AuditLog: mocks.models.audit }
})
vi.mock('@/lib/db/models/Github', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  mocks.models.issueLink = memoryModel()
  return { GithubIssueLink: mocks.models.issueLink, GithubMapping: memoryModel() }
})

import { createColumn, deleteColumn, getBoard, reorderColumns, updateColumn } from '@/features/tasks/server/columns'
import { createTask, deleteTask, getTask, getTaskOptions, listTasks, moveTask, runBulkTasks, setTaskArchived, updateTask } from '@/features/tasks/server/service'

const reset = () => {
  for (const model of Object.values(mocks.models)) model.docs.length = 0
}

const seedProject = async () =>
  (await mocks.models.project.create({ repo: 'o/go', repoUrl: 'https://github.com/o/go', name: 'go', sigla: 'GO', entryColumnKey: 'todo', enabled: true, taskSeq: 0 }))._id as string

const create = async (projectId: string, overrides: Record<string, unknown> = {}) =>
  createTask({ title: 'Tarefa', projectId, columnId: 'todo', priority: 'high', ...overrides } as never, { actorId: 'local' })

beforeEach(() => {
  vi.clearAllMocks()
  reset()
})

describe('criar, listar e detalhar', () => {
  it('gera o código sequencial por projeto e vai para o fim da coluna', async () => {
    const pid = await seedProject()
    const a = await create(pid)
    const b = await create(pid, { title: 'Segunda' })
    expect(a).toMatchObject({ code: 'GO-1', columnId: 'todo', order: 0, priority: 'high', project: { id: pid, sigla: 'GO' } })
    expect(b).toMatchObject({ code: 'GO-2', order: 1 })
    expect(mocks.publish).toHaveBeenCalledWith(['private-app'], 'tasks-updated', { ids: [a.id] })
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: 'Tarefa', acao: 'CRIAR' }))
  })

  it('lista só as não arquivadas, junta o projeto e filtra por includeArchived', async () => {
    const pid = await seedProject()
    const a = await create(pid)
    await setTaskArchived(a.id, true, 'local')
    expect((await listTasks(false)).tasks).toHaveLength(0)
    const all = await listTasks(true)
    expect(all.tasks).toHaveLength(1)
    expect(all.tasks[0]).toMatchObject({ id: a.id, archived: true, project: { name: 'go' } })
  })

  it('detalhe traz comentários, histórico e horas; id inválido é 404', async () => {
    const pid = await seedProject()
    const a = await create(pid)
    await expect(getTask('nope')).rejects.toMatchObject({ status: 404, code: 'TASK_NOT_FOUND' })
    const detail = await getTask(a.id)
    expect(detail).toMatchObject({ id: a.id, code: 'GO-1', description: null, comments: [], totalTimeLogged: 0 })
  })

  it('opções listam os projetos', async () => {
    const pid = await seedProject()
    expect(await getTaskOptions()).toEqual({ projects: [expect.objectContaining({ id: pid, name: 'go' })] })
  })
})

describe('editar, mover e arquivar', () => {
  it('atualiza campos e muda de coluna levando ao fim dela', async () => {
    const pid = await seedProject()
    const a = await create(pid)
    await updateTask(a.id, { title: 'Novo título', priority: 'low' }, 'local')
    expect(await getTask(a.id)).toMatchObject({ title: 'Novo título', priority: 'low' })

    const moved = await moveTask(a.id, { targetColumn: 'doing' }, 'local')
    expect(moved).toMatchObject({ columnId: 'doing', order: 0 })
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ acao: 'MOVER' }))
    expect(await moveTask(a.id, { targetColumn: 'doing' }, 'local')).toBeNull()
  })

  it('arquivar e excluir limpam comentários e horas', async () => {
    const pid = await seedProject()
    const a = await create(pid)
    await mocks.models.comment.create({ taskId: a.id, content: 'oi' })
    await deleteTask(a.id, 'local')
    expect(mocks.models.comment.docs).toHaveLength(0)
    await expect(getTask(a.id)).rejects.toMatchObject({ status: 404 })
  })
})

describe('lote', () => {
  it('aplica prioridade/arquivar/mover e resume por tarefa, com UM evento', async () => {
    const pid = await seedProject()
    const a = await create(pid)
    const b = await create(pid, { title: 'B' })
    mocks.publish.mockClear()
    const results = await runBulkTasks(
      {
        items: [
          { id: a.id, action: { type: 'priority', priority: 'urgent' } },
          { id: b.id, action: { type: 'archive', archive: true } },
          { id: 'x', action: { type: 'priority', priority: 'urgent' } },
        ],
      } as never,
      'local',
    )
    expect(results.map((r) => r.ok)).toEqual([true, true, false])
    expect((await getTask(a.id)).priority).toBe('urgent')
    expect((await getTask(b.id)).archived).toBe(true)
    expect(mocks.publish).toHaveBeenCalledTimes(1)
    expect(mocks.publish.mock.calls[0][2].ids).toHaveLength(2)
  })
})

describe('colunas do quadro', () => {
  it('semeia o quadro padrão na primeira leitura', async () => {
    expect((await getBoard()).columns.map((c) => c.key)).toEqual(['todo', 'doing', 'done'])
  })

  it('cria depois de uma coluna, edita e reordena', async () => {
    const created = await createColumn({ name: 'Extra', color: 'rose', icon: 'star', description: '', wipLimit: 3, afterKey: 'todo' }, 'local')
    expect((await getBoard()).layout).toEqual(['todo', created.key, 'doing', 'done'])

    await updateColumn(created.key, { name: 'Extra 2', color: 'sky', icon: 'flag', description: 'desc', wipLimit: null }, 'local')
    const board = await getBoard()
    expect(board.columns.find((c) => c.key === created.key)).toMatchObject({ name: 'Extra 2', color: 'sky', description: 'desc', wipLimit: null })

    const order = ['done', 'todo', created.key, 'doing']
    expect((await reorderColumns(order, 'local')).layout).toEqual(order)
    await expect(reorderColumns(['done'], 'local')).rejects.toMatchObject({ status: 409, code: 'COLUMNS_CHANGED' })
  })

  it('não exclui coluna com tarefas nem a coluna de entrada de um projeto', async () => {
    const pid = await seedProject()
    await create(pid)
    await expect(deleteColumn('todo', 'local')).rejects.toMatchObject({ status: 409 })
    await deleteColumn('done', 'local')
    expect((await getBoard()).columns.map((c) => c.key)).toEqual(['todo', 'doing'])
  })
})


describe('auditoria da sincronização do GitHub', () => {
  it('descreve no histórico as alterações vindas do GitHub', async () => {
    const pid = await seedProject()
    const a = await create(pid)
    await mocks.models.audit.create({
      entidade: 'Tarefa',
      entidadeId: a.id,
      acao: 'ATUALIZAR',
      dadosAnteriores: { titulo: 'Antigo' },
      dadosNovos: { titulo: 'Novo', origem: 'github' },
      timestamp: new Date(),
    })
    const detail = await getTask(a.id)
    expect(detail.history[0]?.description).toBe('Sincronizada do GitHub: alterou título')
  })
})
