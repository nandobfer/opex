import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Troca do modelo no fork (servidor): vale para as próximas mensagens (inclusive a consolidação do
 * resumo), mantém o agente do modo, não é herdada por fork novo e exige fork em aberto. OpenCode mockado.
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
  forkAgent: { value: 'plan' },
  assertAgentConfigs: vi.fn(async () => undefined),
}))

vi.mock('@/features/agentic/server/developer-memories', () => ({ syncDeveloperMemories: async () => ({ applied: true, section: '' }), withDeveloperMemories: (_sync: unknown, text: string) => text }))
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
vi.mock('@/features/agentic/server/settings', () => ({ loadAgenticSettings: vi.fn(async () => ({ settings: { enabled: true, agents: { fork: { agent: mocks.forkAgent.value, model: null, variant: null } } } })), agenticAvailability: vi.fn(async () => ({ available: true, reason: null })), assertAgentConfigs: mocks.assertAgentConfigs }))
vi.mock('@/features/agentic/server/workflow', () => ({ getWorkbench: mocks.getWorkbench, revisePlan: mocks.revisePlan, requestCorrection: mocks.requestCorrection, submitPrFeedback: mocks.submitPrFeedback, reopen: mocks.reopen }))

import { AgenticFork, AgenticWorkbench } from '@/lib/db/models/Agentic'
import { defaultCentralConfig } from '@/features/agentic/schemas'
import { closeFork, integrateFork, openFork, sendForkMessage, setForkModel } from '@/features/agentic/server/forks'

type Docs = { docs: Record<string, unknown>[]; create: (doc: Record<string, unknown>) => Promise<{ _id: string }> }
const workbenches = AgenticWorkbench as unknown as Docs
const forks = AgenticFork as unknown as Docs
const fork = (id: string) => forks.docs.find((doc) => String(doc._id) === id) as Record<string, unknown> | undefined
const bench = (id: string) => workbenches.docs.find((doc) => String(doc._id) === id) as Record<string, unknown>

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

beforeEach(() => {
  vi.clearAllMocks()
  workbenches.docs.length = 0
  forks.docs.length = 0
  mocks.active.clear()
  mocks.forkAgent.value = 'plan'
  mocks.loadCentral.mockResolvedValue({ doc: { projectName: 'App', projectId: 'p1' }, config: defaultCentralConfig('/home/u/app') })
  mocks.client.session.fork.mockResolvedValue({ id: 'fork-sess-1', location: { directory: '/home/u/app/worktrees/ope-1' } })
  mocks.client.session.create.mockResolvedValue({ id: 'fresh-sess-1', location: { directory: '/home/u/app' } })
  mocks.client.session.update.mockResolvedValue(undefined)
  mocks.client.session.instructions.entry.put.mockResolvedValue(undefined)
  mocks.runTurn.mockResolvedValue({ outcome: 'succeeded', text: 'Resposta', message: null, costUsd: 0, durationMs: 1 })
  mocks.getWorkbench.mockImplementation(async (id: string) => asDto(id))
})

describe('trocar o modelo do fork', () => {
  const lastTurn = () => mocks.runTurn.mock.calls.at(-1)![1] as { text: string; agent: { agent: string | null; model: string | null; variant: string | null } }

  it('fork novo começa no modelo do papel; a troca vale nas próximas mensagens e mantém o agente do Mode', async () => {
    const id = await workbench()
    const dto = await openFork(id, 'a')
    expect(dto.model).toEqual({ model: null, variant: null, overridden: false })
    await settle(dto.id)

    const changed = await setForkModel(id, dto.id, { model: 'openai/gpt-5', variant: 'high' })
    expect(changed.model).toEqual({ model: 'openai/gpt-5', variant: 'high', overridden: true })
    expect(changed.mode).toBe('plan')
    expect(mocks.assertAgentConfigs).toHaveBeenCalledWith([{ label: 'Modelo do fork', config: { agent: null, model: 'openai/gpt-5', variant: 'high' } }], false)
    expect(mocks.publish).toHaveBeenCalledWith(dto.id, expect.objectContaining({ type: 'notice', message: 'Modelo do fork trocado para openai/gpt-5 (high): vale a partir da próxima mensagem.' }))
    expect(mocks.recordAudit).toHaveBeenLastCalledWith(expect.objectContaining({ depois: expect.objectContaining({ fork: 1, modelo: 'openai/gpt-5 (high)', trocado: true }) }))

    await sendForkMessage(id, dto.id, 'e agora?')
    expect(lastTurn().agent).toEqual({ agent: 'plan', model: 'openai/gpt-5', variant: 'high' })
    await settle(dto.id)

    // A consolidação do resumo também usa o modelo trocado.
    await closeFork(id, dto.id)
    await integrateFork(id, dto.id)
    expect(lastTurn().agent.model).toBe('openai/gpt-5')
  })

  it('voltar ao padrão remove a troca', async () => {
    const id = await workbench()
    const dto = await openFork(id, 'a')
    await settle(dto.id)
    await setForkModel(id, dto.id, { model: 'openai/gpt-5', variant: null })
    const reset = await setForkModel(id, dto.id, { model: null, variant: null })
    expect(reset.model).toEqual({ model: null, variant: null, overridden: false })
    expect(fork(dto.id)?.modelOverride).toBeNull()
  })

  it('fork de fork não herda a troca do pai', async () => {
    const id = await workbench()
    const parent = await openFork(id, 'a')
    await settle(parent.id)
    await setForkModel(id, parent.id, { model: 'openai/gpt-5', variant: null })
    mocks.client.session.fork.mockResolvedValueOnce({ id: 'child-sess-9', location: { directory: '/home/u/app/worktrees/ope-1' } })
    const child = await openFork(id, 'b', { parentForkId: parent.id })
    expect(child.model).toEqual({ model: null, variant: null, overridden: false })
  })

  it('fork que não está em aberto não troca (409)', async () => {
    const id = await workbench()
    const dto = await openFork(id, 'a')
    await settle(dto.id)
    forks.docs.find((doc) => String(doc._id) === dto.id)!.status = 'integrated'
    await expect(setForkModel(id, dto.id, { model: 'openai/gpt-5', variant: null })).rejects.toMatchObject({ status: 409 })
  })
})
