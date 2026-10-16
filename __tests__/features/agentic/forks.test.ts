import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Forks da conversa (servidor): abrir (cópia da sessão principal ou sessão nova com o contexto da
 * mesa), somente leitura, encerrar/retomar, integrar (resumo, ajuste, destino), descartar e o
 * tratamento dos forks em aberto na conclusão e na exclusão da mesa. OpenCode sempre mockado.
 */

const mocks = vi.hoisted(() => ({
  client: {
    session: {
      fork: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      interrupt: vi.fn(),
      instructions: { entry: { put: vi.fn() } },
      form: { reply: vi.fn(), cancel: vi.fn() },
    },
    permission: { reply: vi.fn() },
  },
  runTurn: vi.fn(),
  publish: vi.fn(),
  publishAgentic: vi.fn(async () => undefined),
  loadCentral: vi.fn(),
  dropEvents: vi.fn(async () => undefined),
  deleteSession: vi.fn(async () => true),
  recordAudit: vi.fn(async () => undefined),
  active: new Set<string>(),
  getWorkbench: vi.fn(),
  revisePlan: vi.fn(async () => undefined),
  requestCorrection: vi.fn(async () => undefined),
  submitPrFeedback: vi.fn(async () => undefined),
  reopen: vi.fn(async () => undefined),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', CRIAR: 'CRIAR' } }))
vi.mock('@opencode/client', () => ({ isSessionNotFoundError: (value: unknown) => (value as { notFound?: boolean } | null)?.notFound === true }))
vi.mock('@/lib/logger', () => {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  return { logger: log, loggerFor: () => log }
})
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local' }) }))
vi.mock('@/lib/ai/opencode-client', () => ({ getOpencodeClient: vi.fn(async () => mocks.client) }))
vi.mock('@/lib/ai/opencode-run', () => ({ runAgentTurn: mocks.runTurn }))
vi.mock('@/lib/db/models/Agentic', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  return { AgenticWorkbench: memoryModel(), AgenticFork: memoryModel(), AgenticCentral: memoryModel(), AgenticEvent: memoryModel() }
})
vi.mock('@/features/agentic/server/centrals', () => ({ loadCentral: mocks.loadCentral, publishAgentic: mocks.publishAgentic, repoForProject: vi.fn(async () => ({ repo: 'org/app', repoUrl: 'https://github.com/org/app' })) }))
vi.mock('@/features/agentic/server/hub', () => ({
  prepareHub: vi.fn(async () => undefined),
  publishWorkbenchEvent: mocks.publish,
  isWorkbenchActive: (id: string) => mocks.active.has(id),
  markWorkbenchActive: (id: string) => mocks.active.add(id),
  clearWorkbenchActive: (id: string) => mocks.active.delete(id),
  abortWorkbenchRun: vi.fn((id: string) => mocks.active.delete(id)),
  dropWorkbenchEvents: mocks.dropEvents,
  flushWorkbenchEvents: vi.fn(async () => undefined),
}))
vi.mock('@/features/agentic/server/session-cleanup', () => ({ deleteWorkbenchSession: mocks.deleteSession }))
vi.mock('@/features/agentic/server/settings', () => ({ loadAgenticSettings: vi.fn(async () => ({ settings: { enabled: true, agents: { fork: { agent: 'plan', model: null, variant: null } } } })), agenticAvailability: vi.fn(async () => ({ available: true, reason: null })) }))
vi.mock('@/features/agentic/server/workflow', () => ({ getWorkbench: mocks.getWorkbench, revisePlan: mocks.revisePlan, requestCorrection: mocks.requestCorrection, submitPrFeedback: mocks.submitPrFeedback, reopen: mocks.reopen }))

import { AgenticFork, AgenticWorkbench } from '@/lib/db/models/Agentic'
import { defaultCentralConfig } from '@/features/agentic/schemas'
import { FORK_CHILD_NOTES_INSTRUCTIONS_KEY, FORK_NOTES_INSTRUCTIONS_KEY } from '@/features/agentic/constants'
import {
  applyForkIntegration,
  closeFork,
  deleteWorkbenchForks,
  deleteCentralForks,
  discardFork,
  getFork,
  handleWorkbenchDone,
  integrateFork,
  openFork,
  resolveForksDonePrompt,
  resumeFork,
  reviseForkSummary,
  sendForkMessage,
} from '@/features/agentic/server/forks'

type Docs = { docs: Record<string, unknown>[]; create: (doc: Record<string, unknown>) => Promise<{ _id: string }> }
const workbenches = AgenticWorkbench as unknown as Docs
const forks = AgenticFork as unknown as Docs
const fork = (id: string) => forks.docs.find((doc) => String(doc._id) === id) as Record<string, unknown> | undefined
const bench = (id: string) => workbenches.docs.find((doc) => String(doc._id) === id) as Record<string, unknown>

describe('limpeza de forks ao excluir a central', () => {
  it('remove as sessões antes dos registros dos forks', async () => {
    const parent = await workbenches.create({ centralId: 'c1', pendingSessionDeletions: [] })
    await forks.create({ centralId: 'c1', workbenchId: String(parent._id), sessionId: 'fork-session', runState: 'idle', status: 'closed' })
    await deleteCentralForks('c1')
    expect(mocks.deleteSession).toHaveBeenCalledWith(String(parent._id), 'fork-session')
    expect(forks.docs).toHaveLength(0)
  })

  it('OpenCode indisponível preserva fork e referência da sessão para tentar novamente', async () => {
    const parent = await workbenches.create({ centralId: 'c1', pendingSessionDeletions: [] })
    await forks.create({ centralId: 'c1', workbenchId: String(parent._id), sessionId: 'fork-session', runState: 'idle', status: 'closed' })
    mocks.deleteSession.mockResolvedValueOnce(false)
    await expect(deleteCentralForks('c1')).rejects.toMatchObject({ code: 'FORK_SESSION_CLEANUP_PENDING' })
    expect(forks.docs).toHaveLength(1)
    expect(bench(String(parent._id)).pendingSessionDeletions).toContain('fork-session')
  })
})

const workbench = async (patch: Record<string, unknown> = {}) =>
  String(
    (
      await workbenches.create({
        centralId: 'c1',
        taskId: 't1',
        taskCode: 'OPE-1',
        taskTitle: 'Tarefa',
        stage: 'plan_review',
        runState: 'idle',
        sessionId: 'main-1',
        sessionDirectory: '/home/u/app/worktrees/ope-1',
        forkSeq: 0,
        forkNotes: [],
        forkNotesSynced: true,
        forksDonePrompt: null,
        pendingSessionDeletions: [],
        plans: [{ version: 1, text: 'Plano v1', feedback: null, createdAt: new Date() }],
        pr: null,
        ...patch,
      })
    )._id,
  )

/** Espera o turno em segundo plano terminar (a rota responde antes). */
const settle = async (forkId: string) => vi.waitFor(() => expect(mocks.active.has(forkId)).toBe(false))

const asDto = (id: string, patch: Record<string, unknown> = {}) => ({ id, stage: bench(id).stage, runState: bench(id).runState, sessionId: bench(id).sessionId, slotQueue: null, ...patch })

/** Abre um fork e o deixa encerrado e com o resumo proposto (pronto para aplicar). */
async function integratingFork(id: string, summary = 'Usar o serviço X') {
  const opened = await openFork(id, 'Por que X?')
  await settle(opened.id)
  await closeFork(id, opened.id)
  mocks.runTurn.mockResolvedValueOnce({ outcome: 'succeeded', text: `## Resumo para integração\n${summary}`, message: null, costUsd: 0, durationMs: 1 })
  await integrateFork(id, opened.id)
  await settle(opened.id)
  return opened.id
}

beforeEach(() => {
  vi.clearAllMocks()
  workbenches.docs.length = 0
  forks.docs.length = 0
  mocks.active.clear()
  mocks.loadCentral.mockResolvedValue({ doc: { projectName: 'App', projectId: 'p1' }, config: defaultCentralConfig('/home/u/app') })
  mocks.client.session.fork.mockResolvedValue({ id: 'fork-sess-1', location: { directory: '/home/u/app/worktrees/ope-1' } })
  mocks.client.session.create.mockResolvedValue({ id: 'fresh-sess-1', location: { directory: '/home/u/app' } })
  mocks.client.session.update.mockResolvedValue(undefined)
  mocks.client.session.instructions.entry.put.mockResolvedValue(undefined)
  mocks.runTurn.mockResolvedValue({ outcome: 'succeeded', text: 'Resposta', message: null, costUsd: 0, durationMs: 1 })
  mocks.getWorkbench.mockImplementation(async (id: string) => asDto(id))
})

describe('abrir fork', () => {
  it('copia a sessão principal, restringe a somente leitura e envia a primeira mensagem', async () => {
    const id = await workbench()
    const dto = await openFork(id, 'Por que o plano usa X?')
    expect(mocks.client.session.fork).toHaveBeenCalledWith({ sessionID: 'main-1' })
    expect(mocks.client.session.update).toHaveBeenCalledWith(expect.objectContaining({ sessionID: 'fork-sess-1', permissions: expect.arrayContaining([{ action: 'edit', resource: '*', effect: 'deny' }]) }))
    expect(dto).toMatchObject({ number: 1, status: 'active', origin: 'fork', forkedFromStage: 'plan_review' })
    expect(mocks.runTurn).toHaveBeenCalledWith(mocks.client, expect.objectContaining({ sessionId: 'fork-sess-1', text: 'Por que o plano usa X?', agent: expect.objectContaining({ agent: 'plan' }) }), expect.anything())
    await settle(dto.id)
    expect(fork(dto.id)).toMatchObject({ runState: 'idle', status: 'active' })
  })

  it('numera os forks da mesa sem repetir', async () => {
    const id = await workbench()
    const first = await openFork(id, 'a')
    await settle(first.id)
    const second = await openFork(id, 'b')
    expect([first.number, second.number]).toEqual([1, 2])
  })

  it('funciona com o agente principal trabalhando (não depende da etapa)', async () => {
    const id = await workbench({ stage: 'implementing', runState: 'running' })
    const dto = await openFork(id, 'O que está sendo feito?')
    expect(dto.forkedFromStage).toBe('implementing')
    expect(mocks.client.session.fork).toHaveBeenCalled()
  })

  it('mesa concluída (sem sessão): sessão nova somente leitura com o contexto da mesa', async () => {
    const id = await workbench({ stage: 'done', sessionId: null, pr: { number: 7, url: 'https://github.com/org/app/pull/7', state: 'merged' } })
    const dto = await openFork(id, 'O que foi feito?')
    expect(mocks.client.session.fork).not.toHaveBeenCalled()
    expect(mocks.client.session.create).toHaveBeenCalledWith(expect.objectContaining({ permissions: expect.arrayContaining([{ action: 'bash', resource: '*', effect: 'deny' }]) }))
    expect(dto.origin).toBe('fresh')
    const text = mocks.runTurn.mock.calls[0]![1].text as string
    expect(text).toContain('Plano v1')
    expect(text).toContain('pull/7')
    expect(text).toContain('O que foi feito?')
  })
})

describe('ciclo de vida', () => {
  it('encerrado não aceita mensagem; retomar volta a conversar', async () => {
    const id = await workbench()
    const opened = await openFork(id, 'a')
    await settle(opened.id)
    await closeFork(id, opened.id)
    await expect(sendForkMessage(id, opened.id, 'b')).rejects.toMatchObject({ status: 409 })
    await resumeFork(id, opened.id)
    await sendForkMessage(id, opened.id, 'b')
    expect(mocks.runTurn).toHaveBeenLastCalledWith(mocks.client, expect.objectContaining({ text: 'b' }), expect.anything())
  })

  it('app reiniciado no meio do turno: o fork vira interrompido', async () => {
    const id = await workbench()
    const created = await forks.create({ workbenchId: id, centralId: 'c1', taskId: 't1', taskCode: 'OPE-1', number: 1, status: 'active', runState: 'running', forkedFromStage: 'plan_review', sessionId: 's' })
    const dto = await getFork(id, String(created._id))
    expect(dto.runState).toBe('interrupted')
  })

  it('descartar remove o fork, a saída e a sessão', async () => {
    const id = await workbench()
    const opened = await openFork(id, 'a')
    await settle(opened.id)
    await closeFork(id, opened.id)
    await discardFork(id, opened.id)
    expect(fork(opened.id)).toBeUndefined()
    expect(mocks.dropEvents).toHaveBeenCalledWith(opened.id)
    expect(mocks.deleteSession).toHaveBeenCalledWith(id, 'fork-sess-1')
    expect(bench(id).pendingSessionDeletions).toContain('fork-sess-1')
  })
})

describe('integrar fork', () => {
  it('consolida o resumo e permite modificar até aplicar', async () => {
    const id = await workbench()
    const forkId = await integratingFork(id)
    expect(fork(forkId)).toMatchObject({ status: 'integrating', summary: 'Usar o serviço X' })

    mocks.runTurn.mockResolvedValueOnce({ outcome: 'succeeded', text: '## Resumo para integração\nUsar o serviço X e Y', message: null, costUsd: 0, durationMs: 1 })
    await reviseForkSummary(id, forkId, 'Inclua o Y')
    expect(mocks.runTurn.mock.lastCall![1].text).toContain('Inclua o Y')
    await settle(forkId)
    expect(fork(forkId)!.summary).toBe('Usar o serviço X e Y')
  })

  it('contexto da conversa principal: grava na mesa e como instrução durável da sessão', async () => {
    const id = await workbench()
    const forkId = await integratingFork(id)
    const dto = await applyForkIntegration(id, forkId, 'context')
    expect(bench(id).forkNotes).toEqual([expect.objectContaining({ forkId, number: 1, summary: 'Usar o serviço X' })])
    expect(mocks.client.session.instructions.entry.put).toHaveBeenCalledWith(expect.objectContaining({ sessionID: 'main-1', key: FORK_NOTES_INSTRUCTIONS_KEY, value: expect.stringContaining('Usar o serviço X') }))
    expect(dto).toMatchObject({ status: 'integrated', integration: expect.objectContaining({ target: 'context' }) })
    expect(mocks.deleteSession).toHaveBeenCalledWith(id, 'fork-sess-1')
  })

  it('planejador em Plano pronto: vira correção do plano com o resumo', async () => {
    const id = await workbench()
    const forkId = await integratingFork(id)
    await applyForkIntegration(id, forkId, 'planner')
    expect(mocks.revisePlan).toHaveBeenCalledWith(id, expect.stringContaining('Usar o serviço X'))
  })

  it('planejador indisponível com o agente executando: recusa e mantém a integração', async () => {
    const id = await workbench()
    const forkId = await integratingFork(id)
    mocks.getWorkbench.mockImplementation(async (wid: string) => asDto(wid, { stage: 'implementing', runState: 'running' }))
    await expect(applyForkIntegration(id, forkId, 'planner')).rejects.toMatchObject({ status: 409 })
    expect(fork(forkId)!.status).toBe('integrating')
    expect(mocks.revisePlan).not.toHaveBeenCalled()
  })

  it('mesa concluída: reabrir com o resumo', async () => {
    const id = await workbench()
    const forkId = await integratingFork(id)
    mocks.getWorkbench.mockImplementation(async (wid: string) => asDto(wid, { stage: 'done', sessionId: null }))
    await applyForkIntegration(id, forkId, 'reopen')
    expect(mocks.reopen).toHaveBeenCalledWith(id, expect.stringContaining('Usar o serviço X'))
  })
})

describe('fork de fork', () => {
  /** Fork 1 aberto (sessão `fork-sess-1`) e um filho dele. */
  async function withChild() {
    const id = await workbench()
    const parent = await openFork(id, 'Por que X?')
    await settle(parent.id)
    mocks.client.session.fork.mockResolvedValueOnce({ id: 'child-sess-1', location: { directory: '/home/u/app/worktrees/ope-1' } })
    const child = await openFork(id, 'E o detalhe Y?', parent.id)
    await settle(child.id)
    return { id, parent, child }
  }

  it('copia a conversa do fork pai, segue a numeração da mesa e é somente leitura', async () => {
    const { parent, child } = await withChild()
    expect(mocks.client.session.fork).toHaveBeenLastCalledWith({ sessionID: 'fork-sess-1' })
    expect(child).toMatchObject({ number: 2, parentForkId: parent.id, parentNumber: 1, origin: 'fork' })
    expect(mocks.client.session.update).toHaveBeenCalledWith(expect.objectContaining({ sessionID: 'child-sess-1', permissions: expect.arrayContaining([{ action: 'edit', resource: '*', effect: 'deny' }]) }))
    expect(mocks.runTurn).toHaveBeenLastCalledWith(mocks.client, expect.objectContaining({ sessionId: 'child-sess-1', text: 'E o detalhe Y?' }), expect.anything())
  })

  it('abre com o pai encerrado ou respondendo; recusa pai integrado', async () => {
    const id = await workbench()
    mocks.runTurn.mockReturnValueOnce(new Promise(() => undefined))
    const parent = await openFork(id, 'a')
    expect((await openFork(id, 'filho com o pai respondendo', parent.id)).parentForkId).toBe(parent.id)
    forks.docs.find((doc) => String(doc._id) === parent.id)!.status = 'integrated'
    await expect(openFork(id, 'b', parent.id)).rejects.toMatchObject({ status: 409 })
  })

  it('pai sem a conversa no OpenCode: 409 sem criar o fork', async () => {
    const id = await workbench()
    const parent = await openFork(id, 'a')
    await settle(parent.id)
    mocks.client.session.fork.mockRejectedValueOnce(Object.assign(new Error('Session not found'), { notFound: true }))
    await expect(openFork(id, 'b', parent.id)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('Fork 1') })
    expect(forks.docs).toHaveLength(1)
  })

  it('integrar no fork pai: grava nos resumos do pai e vira instrução da conversa dele', async () => {
    const { id, parent, child } = await withChild()
    await closeFork(id, child.id)
    mocks.runTurn.mockResolvedValueOnce({ outcome: 'succeeded', text: '## Resumo para integração\nDetalhe Y resolvido', message: null, costUsd: 0, durationMs: 1 })
    await integrateFork(id, child.id)
    await settle(child.id)
    const dto = await applyForkIntegration(id, child.id, 'parent')
    expect(fork(parent.id)!.childNotes).toEqual([expect.objectContaining({ forkId: child.id, number: 2, summary: 'Detalhe Y resolvido' })])
    expect(mocks.client.session.instructions.entry.put).toHaveBeenCalledWith(expect.objectContaining({ sessionID: 'fork-sess-1', key: FORK_CHILD_NOTES_INSTRUCTIONS_KEY, value: expect.stringContaining('Detalhe Y resolvido') }))
    expect(dto).toMatchObject({ status: 'integrated', integration: expect.objectContaining({ target: 'parent' }) })
    expect(mocks.revisePlan).not.toHaveBeenCalled()
  })

  it('instrução recusada: os resumos vão uma vez no próximo prompt do pai', async () => {
    const { id, parent, child } = await withChild()
    await closeFork(id, child.id)
    mocks.runTurn.mockResolvedValueOnce({ outcome: 'succeeded', text: '## Resumo para integração\nDetalhe Y', message: null, costUsd: 0, durationMs: 1 })
    await integrateFork(id, child.id)
    await settle(child.id)
    mocks.client.session.instructions.entry.put.mockRejectedValueOnce(new Error('não suportado'))
    await applyForkIntegration(id, child.id, 'parent')
    expect(fork(parent.id)!.childNotesSynced).toBe(false)

    await sendForkMessage(id, parent.id, 'continuando')
    await settle(parent.id)
    expect(mocks.runTurn.mock.lastCall![1].text).toContain('Detalhe Y')
    expect(mocks.runTurn.mock.lastCall![1].text).toContain('continuando')
    expect(fork(parent.id)!.childNotesSynced).toBe(true)
  })

  it('pai descartado: o filho continua e o destino "Fork pai" é recusado', async () => {
    const { id, parent, child } = await withChild()
    await closeFork(id, parent.id)
    await discardFork(id, parent.id)
    expect(fork(child.id)).toMatchObject({ status: 'active', parentNumber: 1 })

    await closeFork(id, child.id)
    mocks.runTurn.mockResolvedValueOnce({ outcome: 'succeeded', text: '## Resumo para integração\nY', message: null, costUsd: 0, durationMs: 1 })
    await integrateFork(id, child.id)
    await settle(child.id)
    await expect(applyForkIntegration(id, child.id, 'parent')).rejects.toMatchObject({ status: 409 })
    expect((await applyForkIntegration(id, child.id, 'context')).status).toBe('integrated')
  })
})

describe('conclusão e exclusão da mesa', () => {
  async function withOpenFork() {
    const id = await workbench({ stage: 'done' })
    const opened = await openFork(id, 'a')
    await settle(opened.id)
    return { id, forkId: opened.id }
  }

  it('Concluir forks: viram histórico e a sessão é excluída', async () => {
    const { id, forkId } = await withOpenFork()
    await handleWorkbenchDone(bench(id) as never, 'conclude')
    expect(fork(forkId)).toMatchObject({ status: 'concluded', sessionId: null })
    expect(mocks.deleteSession).toHaveBeenCalledWith(id, 'fork-sess-1')
  })

  it('Concluir forks com um fork respondendo: interrompe o turno', async () => {
    const id = await workbench({ stage: 'done' })
    mocks.runTurn.mockReturnValueOnce(new Promise(() => undefined))
    const opened = await openFork(id, 'a')
    await handleWorkbenchDone(bench(id) as never, 'conclude')
    expect(mocks.client.session.interrupt).toHaveBeenCalledWith({ sessionID: 'fork-sess-1' })
    expect(fork(opened.id)!.status).toBe('concluded')
  })

  it('Não concluir: os forks seguem abertos', async () => {
    const { id, forkId } = await withOpenFork()
    await handleWorkbenchDone(bench(id) as never, 'keep')
    expect(fork(forkId)!.status).toBe('active')
    expect(bench(id).forksDonePrompt).toBeNull()
  })

  it('Sempre perguntar: deixa a pergunta pendente e a resposta conclui ou mantém', async () => {
    const { id, forkId } = await withOpenFork()
    mocks.getWorkbench.mockImplementation(async (wid: string) => asDto(wid))
    await handleWorkbenchDone(bench(id) as never, 'ask')
    expect(bench(id).forksDonePrompt).toMatchObject({ count: 1 })
    expect(fork(forkId)!.status).toBe('active')

    await resolveForksDonePrompt(id, 'conclude')
    expect(fork(forkId)!.status).toBe('concluded')
    expect(bench(id).forksDonePrompt).toBeNull()
    await expect(resolveForksDonePrompt(id, 'keep')).rejects.toMatchObject({ status: 409 })
  })

  it('sem forks em aberto não pergunta nada', async () => {
    const id = await workbench({ stage: 'done' })
    await handleWorkbenchDone(bench(id) as never, 'ask')
    expect(bench(id).forksDonePrompt).toBeNull()
  })

  it('excluir a mesa apaga os forks e leva as sessões para as exclusões pendentes', async () => {
    const { id, forkId } = await withOpenFork()
    await deleteWorkbenchForks(id)
    expect(fork(forkId)).toBeUndefined()
    expect(mocks.dropEvents).toHaveBeenCalledWith(forkId)
    expect(bench(id).pendingSessionDeletions).toContain('fork-sess-1')
  })
})
