import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Anexos dos campos da mesa (MT-21): os arquivos vão no prompt do turno (conteúdo + seção com links),
 * aparecem na saída junto da mensagem, são vinculados à mesa, sobrevivem à espera por vaga e voltam no
 * "Tentar novamente". O chat durante a execução também entrega os anexos. OpenCode e storage falsos.
 */

const FILE = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'tela.png', mediaType: 'image/png', size: 2048 }
const DTO = { ...FILE, kind: 'image', url: `/api/agentic/files/${FILE.id}` }

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  loadCentral: vi.fn(),
  recordAudit: vi.fn(async () => undefined),
  runTurn: vi.fn(),
  settings: vi.fn(),
  availability: vi.fn(async () => ({ available: true, reason: null })),
  steer: vi.fn(async () => true),
  active: new Set<string>(),
  loadClaimable: vi.fn(),
  claim: vi.fn(async () => undefined),
  promptFiles: vi.fn(),
  dtos: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.recordAudit, AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', CRIAR: 'CRIAR' } }))
vi.mock('@/features/local-docker/server/agentic-hooks', () => ({ resolveBuildTarget: async () => null, teardownForCleanup: async () => false }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local' }) }))
vi.mock('@/lib/ai/opencode-client', () => ({
  getOpencodeClient: vi.fn(async () => ({
    session: {
      get: async () => ({ id: 'sess-1', location: { directory: '/home/u/app' } }),
      create: async () => ({ id: 'sess-1', location: { directory: '/home/u/app' } }),
    },
  })),
}))
vi.mock('@/lib/ai/opencode-run', () => ({ steerAgentTurn: mocks.steer }))
vi.mock('@/lib/db/models/Agentic', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  return { AgenticWorkbench: memoryModel(), AgenticCentral: memoryModel(), AgenticEvent: memoryModel() }
})
vi.mock('@/features/agentic/server/centrals', () => ({ loadCentral: mocks.loadCentral, repoForProject: vi.fn(async () => null), publishAgentic: vi.fn(async () => undefined), entryColumnForProject: vi.fn(async () => null) }))
vi.mock('@/features/agentic/server/hub', () => ({
  prepareHub: vi.fn(),
  publishWorkbenchEvent: mocks.publish,
  isWorkbenchActive: (id: string) => mocks.active.has(id),
  markWorkbenchActive: vi.fn(),
  clearWorkbenchActive: vi.fn(),
  abortWorkbenchRun: vi.fn(),
  dropWorkbenchEvents: vi.fn(),
  flushWorkbenchEvents: vi.fn(async () => undefined),
}))
vi.mock('@/features/agentic/server/log', () => ({ centralLogger: () => ({ info: vi.fn(), step: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/features/agentic/server/ports', () => ({ releasePreviewPort: vi.fn(async () => undefined), allocatePreviewPort: vi.fn(), waitForPreview: vi.fn() }))
vi.mock('@/features/time/server/service', () => ({ listActiveTimers: vi.fn(async () => []), startTimer: vi.fn(async () => undefined), stopTimer: vi.fn(async () => undefined) }))
vi.mock('@/features/agentic/server/session-cleanup', () => ({ deleteWorkbenchSession: vi.fn(async () => true), flushPendingSessionDeletions: vi.fn(async () => undefined) }))
vi.mock('@/features/agentic/server/queue', () => ({ pumpCentralQueue: vi.fn(async () => undefined) }))
vi.mock('@/features/agentic/server/settings', () => ({ loadAgenticSettings: mocks.settings, agenticAvailability: mocks.availability }))
vi.mock('@/features/agentic/server/runner', () => ({ runAgentTurn: mocks.runTurn }))
vi.mock('@/features/tasks/server/service', () => ({ getTask: vi.fn(), moveTask: vi.fn() }))
vi.mock('@/features/ai/understand-task', () => ({ buildUnderstandTaskPrompt: vi.fn(() => 'tarefa') }))
vi.mock('@/features/agentic/server/files', () => ({
  loadClaimableFiles: mocks.loadClaimable,
  claimAgenticFiles: mocks.claim,
  promptFilesFor: mocks.promptFiles,
  fileDtosFor: mocks.dtos,
  fileIdsOf: (files: { id: string }[]) => (files.length ? { fileIds: files.map((file) => file.id) } : {}),
  liveAttachments: async () => ({ files: [{ name: 'tela.png', uri: 'data:image/png;base64,AAA' }], section: '## Arquivos anexados pelo usuário', shown: [DTO] }),
  deleteWorkbenchFiles: vi.fn(async () => undefined),
}))

import { AgenticWorkbench } from '@/lib/db/models/Agentic'
import { defaultCentralConfig, DEFAULT_AGENTIC_SETTINGS } from '@/features/agentic/schemas'
import { implement, retry, revisePlan, sendLiveMessage, startPendingTurn } from '@/features/agentic/server/workflow'

const model = AgenticWorkbench as unknown as { docs: Record<string, unknown>[]; create: (doc: Record<string, unknown>) => Promise<{ _id: string }> }
const state = (id: string) => model.docs.find((doc) => String(doc._id) === id) as Record<string, unknown> & { pendingTurn: { fileIds?: string[] } | null; lastPrompt: { fileIds?: string[] } | null }

const workbench = async (overrides: Record<string, unknown> = {}) =>
  String(
    (
      await model.create({
        centralId: 'c1',
        taskId: `t${model.docs.length + 1}`,
        taskCode: 'MT-21',
        taskTitle: 'Anexos',
        stage: 'plan_review',
        runState: 'idle',
        sessionId: 'sess-1',
        sessionDirectory: '/home/u/app',
        branch: 'feat/mt-21',
        worktreePath: '/home/u/app/worktrees/mt-21',
        pendingTurn: null,
        pr: null,
        pastPrs: [],
        pendingSessionDeletions: [],
        pendingPermissions: [],
        pendingForms: [],
        plans: [{ version: 1, text: 'Plano', feedback: null, createdAt: new Date() }],
        startedAt: new Date(),
        ...overrides,
      })
    )._id,
  )

beforeEach(() => {
  vi.clearAllMocks()
  model.docs.length = 0
  mocks.active.clear()
  mocks.loadCentral.mockResolvedValue({ doc: { projectName: 'App', projectId: 'p1' }, config: { ...defaultCentralConfig('/home/u/app'), maxConcurrent: 1 } })
  mocks.settings.mockResolvedValue({ settings: { ...DEFAULT_AGENTIC_SETTINGS, liveChat: true } })
  mocks.availability.mockResolvedValue({ available: true, reason: null })
  mocks.runTurn.mockReturnValue(new Promise(() => undefined))
  mocks.loadClaimable.mockImplementation(async (ids?: string[]) => (ids?.length ? [FILE] : []))
  mocks.dtos.mockImplementation(async (ids?: string[]) => (ids?.length ? [DTO] : []))
  mocks.promptFiles.mockResolvedValue({ files: [{ name: 'tela.png', uri: 'data:image/png;base64,AAA' }], section: '## Arquivos anexados pelo usuário\n- `tela.png`' })
})

describe('anexos nas ações da mesa', () => {
  it('a correção do plano leva os arquivos ao prompt, mostra na saída e vincula à mesa', async () => {
    const id = await workbench()
    await revisePlan(id, 'Use o layout da imagem', [FILE.id])

    expect(mocks.publish).toHaveBeenCalledWith(id, { type: 'user', text: 'Use o layout da imagem', files: [DTO] })
    expect(mocks.claim).toHaveBeenCalledWith([FILE], { workbenchId: id })
    await vi.waitFor(() => expect(mocks.runTurn).toHaveBeenCalledTimes(1))
    const request = mocks.runTurn.mock.calls[0]![1] as { text: string; files: unknown[] }
    expect(request.files).toEqual([{ name: 'tela.png', uri: 'data:image/png;base64,AAA' }])
    expect(request.text).toContain('## Arquivos anexados pelo usuário')
    expect(mocks.promptFiles).toHaveBeenCalledWith([FILE.id], expect.objectContaining({ downloadDir: '/tmp/opex-anexos/MT-21' }))
    expect(state(id).lastPrompt?.fileIds).toEqual([FILE.id])
  })

  it('sem anexos, o turno segue como antes (sem seção e sem arquivos)', async () => {
    const id = await workbench()
    await implement(id)
    await vi.waitFor(() => expect(mocks.runTurn).toHaveBeenCalledTimes(1))
    const request = mocks.runTurn.mock.calls[0]![1] as { text: string; files: unknown[] }
    expect(request.files).toEqual([])
    expect(request.text).not.toContain('Arquivos anexados')
    expect(mocks.promptFiles).not.toHaveBeenCalled()
  })

  it('arquivo inválido ou já usado recusa a ação antes de começar o turno', async () => {
    const id = await workbench()
    mocks.loadClaimable.mockRejectedValueOnce(Object.assign(new Error('Algum arquivo não foi encontrado'), { status: 400 }))
    await expect(revisePlan(id, 'x x x', [FILE.id])).rejects.toMatchObject({ status: 400 })
    expect(mocks.runTurn).not.toHaveBeenCalled()
    expect(mocks.claim).not.toHaveBeenCalled()
  })

  it('a espera por vaga guarda os anexos e a retomada os entrega', async () => {
    const busy = await workbench({ stage: 'implementing', runState: 'running' })
    const id = await workbench()
    await implement(id, 'detalhe', [FILE.id])
    expect(state(id).pendingTurn?.fileIds).toEqual([FILE.id])
    expect(mocks.runTurn).not.toHaveBeenCalled()

    model.docs.splice(model.docs.findIndex((doc) => String(doc._id) === busy), 1)
    expect(await startPendingTurn(id)).toBe('started')
    await vi.waitFor(() => expect(mocks.runTurn).toHaveBeenCalledTimes(1))
    expect((mocks.runTurn.mock.calls[0]![1] as { files: unknown[] }).files).toHaveLength(1)
  })

  it('"Tentar novamente" reenvia os anexos da mensagem original', async () => {
    const id = await workbench({ stage: 'planning', runState: 'failed', error: 'caiu', lastPrompt: { stage: 'planning', text: 'plano', fileIds: [FILE.id] } })
    await retry(id)
    await vi.waitFor(() => expect(mocks.runTurn).toHaveBeenCalledTimes(1))
    expect(mocks.promptFiles).toHaveBeenCalledWith([FILE.id], expect.anything())
  })
})

describe('anexos no chat durante a execução', () => {
  it('entrega texto + seção e os arquivos ao turno atual e mostra na saída', async () => {
    const id = await workbench({ stage: 'implementing', runState: 'running' })
    mocks.active.add(id)
    await sendLiveMessage(id, 'veja o print', [FILE.id])
    expect(mocks.steer).toHaveBeenCalledWith(id, expect.stringContaining('## Arquivos anexados pelo usuário'), [{ name: 'tela.png', uri: 'data:image/png;base64,AAA' }])
    expect(mocks.publish).toHaveBeenCalledWith(id, { type: 'user', text: 'veja o print', files: [DTO] })
    expect(mocks.claim).toHaveBeenCalledWith([FILE], { workbenchId: id })
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ depois: expect.objectContaining({ anexos: ['tela.png'] }) }))
  })
})
