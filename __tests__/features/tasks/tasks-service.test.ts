import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  recordAudit: vi.fn(),
  publish: vi.fn(),
  notifyQueue: vi.fn(),
  pushIssues: vi.fn(),
  afterTasks: [] as Promise<unknown>[],
  models: {} as Record<string, { docs: unknown[]; create: (doc: Record<string, unknown>) => Promise<{ _id: string }>; aggregate: (...args: unknown[]) => Promise<unknown[]> }>,
}))

vi.mock('@/lib/db', () => ({
  dbConnect: vi.fn(),
  recordAudit: mocks.recordAudit,
  AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', MOVER: 'MOVER', EXCLUIR: 'EXCLUIR' },
}))
vi.mock('@/lib/pusher/channels', () => ({ appChannel: () => 'private-app', publishToChannels: mocks.publish }))
vi.mock('@/lib/after-response', () => ({ runAfterResponse: (_label: string, task: () => Promise<unknown>) => { mocks.afterTasks.push(task()) } }))
vi.mock('@/features/agentic/server/queue', () => ({ notifyTasksColumnChanged: mocks.notifyQueue }))
vi.mock('@/features/github/server/issue-links', () => ({ issueRefsFor: async () => new Map() }))
vi.mock('@/features/github/server/task-sync', () => ({ pushTasksToIssues: mocks.pushIssues }))
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
vi.mock('@/lib/db/models/Agentic', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  mocks.models.central = memoryModel()
  return { AgenticCentral: mocks.models.central, AgenticWorkbench: memoryModel(), AgenticEvent: memoryModel() }
})
vi.mock('@/lib/db/models/Orcamento', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  mocks.models.orcamentoClient = memoryModel()
  mocks.models.orcamentoDraft = memoryModel()
  return { OrcamentoClient: mocks.models.orcamentoClient, OrcamentoDraft: mocks.models.orcamentoDraft }
})

import { createColumn, deleteColumn, getBoard, reorderColumns, updateColumn } from '@/features/tasks/server/columns'
import { updateTaskSchema } from '@/features/tasks/schemas'
import { addComment, createTask, deleteTask, getTask, getTaskOptions, listTasks, listTasksForClient, moveTask, runBulkTasks, setTaskArchived, setTaskClient, updateTask, updateTaskEstimate } from '@/features/tasks/server/service'

const reset = () => {
  for (const model of Object.values(mocks.models)) model.docs.length = 0
  mocks.afterTasks.length = 0
}

const seedProject = async (overrides: Record<string, unknown> = {}) =>
  (await mocks.models.project.create({ repo: 'o/go', repoUrl: 'https://github.com/o/go', name: 'go', sigla: 'GO', entryColumnKey: 'todo', enabled: true, taskSeq: 0, ...overrides }))._id as string

const create = async (projectId: string, overrides: Record<string, unknown> = {}) =>
  createTask({ title: 'Tarefa', projectId, columnId: 'todo', priority: 'high', ...overrides } as never, { actorId: 'local' })

const seedClient = async (overrides: Record<string, unknown> = {}) =>
  (await mocks.models.orcamentoClient.create({ name: 'ACME', token: 'cli_x', tokenHash: 'h', tokenPrefix: 'cli_x', projectIds: [], hourlyRate: 100, profitFactor: 2, active: true, ...overrides }))._id as string

const createEstimated = async (projectId: string, estimate: Record<string, unknown>) =>
  createTask({ title: 'Estimada', projectId, columnId: 'todo', priority: 'medium' } as never, {
    actorId: 'local',
    estimate: { hours: 5, clientHours: 5, billingBrl: 0, factor: 1, hourlyRate: 0, model: 'gemini/pro', ...estimate },
  })

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

  it('mover para outra coluna avisa o desenvolvimento agêntico (fila da central)', async () => {
    const pid = await seedProject()
    const a = await create(pid)
    await Promise.all(mocks.afterTasks)
    mocks.afterTasks.length = 0
    mocks.notifyQueue.mockClear()
    await moveTask(a.id, { targetColumn: 'doing' }, 'local')
    await Promise.all(mocks.afterTasks)
    expect(mocks.notifyQueue).toHaveBeenCalledTimes(1)
    expect(mocks.notifyQueue).toHaveBeenCalledWith([a.id])
  })
})

describe('sincronização com o GitHub ao mutar a tarefa', () => {
  it('mover para a coluna de conclusão empurra a tarefa para a issue (fecha)', async () => {
    const pid = await seedProject({ closedColumnKey: 'done' })
    const a = await create(pid)
    mocks.pushIssues.mockClear()
    await moveTask(a.id, { targetColumn: 'done' }, 'local')
    expect(mocks.pushIssues).toHaveBeenCalledWith([a.id])
  })

  it('sair da coluna de conclusão empurra de volta (reabre)', async () => {
    const pid = await seedProject({ closedColumnKey: 'done' })
    const a = await create(pid)
    await moveTask(a.id, { targetColumn: 'done' }, 'local')
    mocks.pushIssues.mockClear()
    await moveTask(a.id, { targetColumn: 'todo' }, 'local')
    expect(mocks.pushIssues).toHaveBeenCalledWith([a.id])
  })

  it('editar título/prioridade sincroniza; só a especificação técnica não', async () => {
    const pid = await seedProject()
    const a = await create(pid)
    mocks.pushIssues.mockClear()
    await updateTask(a.id, { title: 'Novo' }, 'local')
    expect(mocks.pushIssues).toHaveBeenCalledWith([a.id])
    mocks.pushIssues.mockClear()
    await updateTask(a.id, { technicalSpec: 'Detalhe interno' }, 'local')
    expect(mocks.pushIssues).not.toHaveBeenCalled()
  })

  it('não sincroniza quando a origem é o GitHub (evita eco)', async () => {
    const pid = await seedProject({ closedColumnKey: 'done' })
    const a = await create(pid)
    mocks.pushIssues.mockClear()
    await moveTask(a.id, { targetColumn: 'done' }, 'system', { origin: 'github' })
    await updateTask(a.id, { title: 'Vindo do GitHub' }, 'system', { origin: 'github' })
    expect(mocks.pushIssues).not.toHaveBeenCalled()
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

  it('não exclui a coluna da fila de uma central', async () => {
    await getBoard()
    await mocks.models.central.create({ projectId: 'p1', projectName: 'go', config: { columns: { queue: 'doing' } } })
    await expect(deleteColumn('doing', 'local')).rejects.toMatchObject({ status: 409, code: 'COLUMN_QUEUE_IN_USE' })
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

describe('estimativa da tarefa (portal do cliente)', () => {
  it('recalcula horas do cliente e faturamento com o cliente que originou a tarefa', async () => {
    const pid = await seedProject()
    await seedClient({ projectIds: [pid], profitFactor: 2, hourlyRate: 100 })
    const a = await createEstimated(pid, { hours: 5 })
    mocks.recordAudit.mockClear()
    mocks.publish.mockClear()

    const estimate = await updateTaskEstimate(a.id, { hours: 3 }, 'local')
    expect(estimate).toMatchObject({ hours: 3, clientHours: 6, billingBrl: 600, factor: 2, hourlyRate: 100 })
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entidade: 'Tarefa',
        entidadeId: a.id,
        acao: 'ATUALIZAR',
        antes: expect.objectContaining({ horasEstimadas: 5 }),
        depois: expect.objectContaining({ horasEstimadas: 3, faturamentoEstimado: 600 }),
      }),
    )
    expect(mocks.publish).toHaveBeenCalledWith(['private-app'], 'tasks-updated', { ids: [a.id] })

    const detail = await getTask(a.id)
    expect(detail.estimate).toMatchObject({ hours: 3, clientHours: 6, billingBrl: 600 })
    expect(detail.estimateClientName).toBe('ACME')
  })

  it('sem cliente que inclua o repositório, usa o fator e o custo/hora do snapshot', async () => {
    const pid = await seedProject()
    const a = await createEstimated(pid, { hours: 5, factor: 3, hourlyRate: 50 })
    const estimate = await updateTaskEstimate(a.id, { hours: 2 }, 'local')
    expect(estimate).toMatchObject({ hours: 2, clientHours: 6, billingBrl: 300, factor: 3, hourlyRate: 50 })
    expect((await getTask(a.id)).estimateClientName).toBeNull()
  })

  it('tarefa sem estimativa devolve 409; id inválido, 404', async () => {
    const pid = await seedProject()
    const a = await create(pid)
    await expect(updateTaskEstimate(a.id, { hours: 1 }, 'local')).rejects.toMatchObject({ status: 409, code: 'TASK_WITHOUT_ESTIMATE' })
    await expect(updateTaskEstimate('nope', { hours: 1 }, 'local')).rejects.toMatchObject({ status: 404, code: 'TASK_NOT_FOUND' })
  })
})

describe('tarefas do portal (cliente)', () => {
  it('guarda o cliente que solicitou e lista só as tarefas dele', async () => {
    const pid = await seedProject()
    const clientId = await seedClient({ projectIds: [pid] })
    const mine = await createTask({ title: 'Do cliente', projectId: pid, columnId: 'todo', priority: 'medium' } as never, { actorId: 'local', origin: 'client', clientId })
    await create(pid, { title: 'Do dono' })
    const list = await listTasksForClient(clientId, false)
    expect(list.tasks.map((task) => task.id)).toEqual([mine.id])
    expect((await listTasksForClient('outro', false)).tasks).toHaveLength(0)
  })

  it('comentário guarda a origem e o nome do autor', async () => {
    const pid = await seedProject()
    const a = await create(pid)
    await addComment(a.id, 'Oi', { id: 'local', type: 'owner', name: 'Fernando' })
    await addComment(a.id, 'Olá', { id: 'ACME', type: 'client', name: 'ACME' })
    const detail = await getTask(a.id)
    expect(detail.comments.map((comment) => [comment.authorType, comment.authorName])).toEqual([
      ['owner', 'Fernando'],
      ['client', 'ACME'],
    ])
  })

  it('comentário legado (sem autor) cai no dono', async () => {
    const pid = await seedProject()
    const a = await create(pid)
    await mocks.models.comment.create({ taskId: a.id, content: 'Antigo' })
    const detail = await getTask(a.id)
    expect(detail.comments[0]).toMatchObject({ authorType: 'owner', authorName: 'Usuário local' })
  })
})

describe('cliente da tarefa (editar na página da tarefa)', () => {
  it('adiciona um cliente: grava o clientId e habilita a estimativa (horas 0, fator do cliente)', async () => {
    const pid = await seedProject()
    const clientId = await seedClient({ projectIds: [pid], profitFactor: 3, hourlyRate: 80 })
    const a = await create(pid)
    mocks.recordAudit.mockClear()
    mocks.publish.mockClear()

    const result = await setTaskClient(a.id, clientId, 'local')
    expect(result.clientId).toBe(clientId)
    expect(result.estimate).toMatchObject({ hours: 0, factor: 3, hourlyRate: 80, clientHours: 0, billingBrl: 0 })

    const detail = await getTask(a.id)
    expect(detail.clientId).toBe(clientId)
    expect(detail.estimate).toMatchObject({ factor: 3, hourlyRate: 80 })
    expect(detail.estimateClientName).toBe('ACME')
    expect(mocks.publish).toHaveBeenCalledWith(['private-app'], 'tasks-updated', { ids: [a.id] })
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: 'Tarefa', entidadeId: a.id, acao: 'ATUALIZAR' }))
  })

  it('troca o cliente e recalcula com o novo fator, preservando as horas', async () => {
    const pid = await seedProject()
    const c1 = await seedClient({ name: 'ACME', projectIds: [pid], profitFactor: 2, hourlyRate: 100 })
    const c2 = await seedClient({ name: 'Globex', projectIds: [pid], profitFactor: 5, hourlyRate: 50 })
    const a = await createEstimated(pid, { hours: 4 })

    await setTaskClient(a.id, c1, 'local')
    const result = await setTaskClient(a.id, c2, 'local')
    expect(result.clientId).toBe(c2)
    expect(result.estimate).toMatchObject({ hours: 4, factor: 5, hourlyRate: 50, clientHours: 20, billingBrl: 1000 })

    const detail = await getTask(a.id)
    expect(detail.clientId).toBe(c2)
    expect(detail.estimateClientName).toBe('Globex')
  })

  it('remove o cliente: zera o clientId e a estimativa e publica a mudança', async () => {
    const pid = await seedProject()
    const clientId = await seedClient({ projectIds: [pid] })
    const a = await createEstimated(pid, { hours: 4 })
    await setTaskClient(a.id, clientId, 'local')
    mocks.publish.mockClear()

    const result = await setTaskClient(a.id, null, 'local')
    expect(result).toEqual({ clientId: null, estimate: null })
    const detail = await getTask(a.id)
    expect(detail.clientId).toBeNull()
    expect(detail.estimate).toBeNull()
    expect(mocks.publish).toHaveBeenCalledWith(['private-app'], 'tasks-updated', { ids: [a.id] })
  })

  it('rejeita cliente inexistente, inativo ou que não cobre o repositório, sem mudar a tarefa', async () => {
    const pid = await seedProject()
    const other = await seedProject({ repo: 'o/outro', sigla: 'OU' })
    const a = await create(pid)
    const inactive = await seedClient({ active: false, projectIds: [pid] })
    const wrongRepo = await seedClient({ projectIds: [other] })

    await expect(setTaskClient(a.id, 'f'.repeat(24), 'local')).rejects.toMatchObject({ status: 404, code: 'CLIENT_NOT_FOUND' })
    await expect(setTaskClient(a.id, inactive, 'local')).rejects.toMatchObject({ status: 400, code: 'CLIENT_INACTIVE' })
    await expect(setTaskClient(a.id, wrongRepo, 'local')).rejects.toMatchObject({ status: 400, code: 'CLIENT_NOT_FOR_PROJECT' })
    expect((await getTask(a.id)).clientId).toBeNull()
  })

  it('usa o cliente da TAREFA (não o do repositório) no nome e no fator ao salvar horas', async () => {
    const pid = await seedProject()
    const chosen = await seedClient({ name: 'ACME', projectIds: [pid], profitFactor: 2, hourlyRate: 100 })
    const a = await create(pid)
    await setTaskClient(a.id, chosen, 'local')
    // Outro cliente passa a cobrir o mesmo repositório e fica "mais recente".
    await seedClient({ name: 'Globex', projectIds: [pid], profitFactor: 9, hourlyRate: 999 })

    const detail = await getTask(a.id)
    expect(detail.estimateClientName).toBe('ACME')

    const estimate = await updateTaskEstimate(a.id, { hours: 3 }, 'local')
    expect(estimate).toMatchObject({ hours: 3, factor: 2, hourlyRate: 100, clientHours: 6, billingBrl: 600 })
  })
})

describe('fluxo da mesa da tarefa (agenticFlow)', () => {
  it('nasce em "preview" e passa para "auto_pr" com auditoria e tempo real', async () => {
    const pid = await seedProject()
    const a = await create(pid)
    expect((await getTask(a.id)).agenticFlow).toBe('preview')

    mocks.recordAudit.mockClear()
    mocks.publish.mockClear()
    await updateTask(a.id, { agenticFlow: 'auto_pr' }, 'local')

    expect((await getTask(a.id)).agenticFlow).toBe('auto_pr')
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        entidade: 'Tarefa',
        entidadeId: a.id,
        acao: 'ATUALIZAR',
        antes: expect.objectContaining({ fluxo: 'Publicar prévia' }),
        depois: expect.objectContaining({ fluxo: 'PR automático' }),
      }),
    )
    expect(mocks.publish).toHaveBeenCalledWith(['private-app'], 'tasks-updated', { ids: [a.id] })
  })

  it('a mudança de fluxo não mexe em outros campos nem sincroniza com a issue do GitHub', async () => {
    const pid = await seedProject()
    const a = await create(pid, { title: 'Original' })
    mocks.pushIssues.mockClear()

    await updateTask(a.id, { agenticFlow: 'auto_pr' }, 'local')

    expect(mocks.pushIssues).not.toHaveBeenCalled()
    expect(await getTask(a.id)).toMatchObject({ title: 'Original', description: null, agenticFlow: 'auto_pr' })
  })

  it('o schema recusa fluxo desconhecido e aceita os dois válidos', () => {
    expect(updateTaskSchema.safeParse({ agenticFlow: 'auto_pr' }).success).toBe(true)
    expect(updateTaskSchema.safeParse({ agenticFlow: 'preview' }).success).toBe(true)
    expect(updateTaskSchema.safeParse({ agenticFlow: 'turbo' }).success).toBe(false)
  })
})
