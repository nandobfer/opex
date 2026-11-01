import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Geração de uma versão do diagrama: sessão nova só de leitura no worktree (ou na base), grafo
 * saneado gravado, uma nova tentativa para resposta inválida, descarte do resultado atrasado e a mesa
 * nunca é tocada.
 */

const mocks = vi.hoisted(() => ({
  settings: null as unknown,
  runTurn: vi.fn(),
  shell: vi.fn(async () => ({ exitCode: 0, status: 'completed', output: 'true' })),
  sessionCreate: vi.fn(async () => ({ id: 'arch-1' })),
  sessionRemove: vi.fn(async () => undefined),
  instructionsPut: vi.fn(async () => undefined),
  permissionReply: vi.fn(async () => undefined),
  formCancel: vi.fn(async () => undefined),
  getTask: vi.fn(async () => ({ description: 'Descrição da tarefa', technicalSpec: 'Spec técnica' })),
  audit: vi.fn(async () => undefined),
  publish: vi.fn(async () => undefined),
  workbenchUpdate: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(), recordAudit: mocks.audit, AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR' } }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publish }))
vi.mock('@/lib/local-user', () => ({ getLocalUser: () => ({ id: 'local', name: 'Eu' }), LOCAL_USER_ID: 'local' }))
vi.mock('@/lib/logger', () => ({ loggerFor: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/features/architect-agent/server/models', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  return { ArchitectDiagram: memoryModel(), architectDb: vi.fn(async () => undefined) }
})
vi.mock('@/lib/db/models/Agentic', async () => {
  const { memoryModel } = await import('../../helpers/memory-model')
  const model = memoryModel()
  return { AgenticWorkbench: { ...model, updateOne: (...args: unknown[]) => (mocks.workbenchUpdate(...args), model.updateOne(...(args as Parameters<typeof model.updateOne>))) } }
})
vi.mock('@/lib/ai/opencode-client', () => ({
  getOpencodeClient: async () => ({
    session: { create: mocks.sessionCreate, remove: mocks.sessionRemove, instructions: { entry: { put: mocks.instructionsPut } }, form: { cancel: mocks.formCancel } },
    permission: { reply: mocks.permissionReply },
  }),
  runOpencodeShell: mocks.shell,
}))
vi.mock('@/lib/ai/opencode-run', () => ({ runAgentTurn: mocks.runTurn }))
vi.mock('@/features/agentic/server/model-fallback', () => ({ runWithFallback: (agent: unknown, text: string, run: (agent: unknown, text: string) => unknown) => run(agent, text), fallbackNotice: () => '' }))
vi.mock('@/features/agentic/server/centrals', () => ({ loadCentral: async () => ({ config: { sessionDirectory: '/repo', worktreeRoot: '/repo/worktrees' } }) }))
vi.mock('@/features/tasks/server/service', () => ({ getTask: mocks.getTask }))
vi.mock('@/features/architect-agent/server/settings', () => ({ loadArchitectSettings: async () => ({ settings: mocks.settings }) }))
vi.mock('@/features/ai/server/agent-memory-context', async () => (await import('../../helpers/memory-context')).memoryContextModule({ 'agentes/arquiteto': ['Camadas do Opex: app/features/lib'] }))
vi.mock('@/features/ai/server/self-memory/settings', async () => (await import('../../helpers/memory-context')).selfMemorySettingsModule())

import { AgenticWorkbench } from '@/lib/db/models/Agentic'
import { ArchitectDiagram } from '@/features/architect-agent/server/models'
import { runDiagram } from '@/features/architect-agent/server/generate'
import { registerDiagram, abortWorkbenchDiagrams, isDiagramLive } from '@/features/architect-agent/server/registry'
import { DEFAULT_ARCHITECT_SETTINGS } from '@/features/architect-agent/schemas'

const diagrams = ArchitectDiagram as unknown as { docs: Record<string, unknown>[]; create: (doc: Record<string, unknown>) => Promise<{ _id: string }> }
const workbenches = AgenticWorkbench as unknown as { docs: Record<string, unknown>[] }

const graphJson = (nodes: unknown[] = [{ id: 'objective', label: 'Objetivo', kind: 'objective', status: 'new' }, { id: 'a', label: 'Aba', kind: 'module', status: 'new', files: ['src/a.tsx'] }], edges: unknown[] = [{ source: 'objective', target: 'a', kind: 'flow' }]) =>
  `Pronto.\n\`\`\`json\n${JSON.stringify({ title: 'Arquitetura', summary: 'Resumo', groups: [], nodes, edges, notes: [] })}\n\`\`\``
const succeeded = (text: string) => ({ outcome: 'succeeded', text, message: null, costUsd: 0.02, durationMs: 10 })

async function seed(overrides: Record<string, unknown> = {}) {
  workbenches.docs.push({ _id: 'w'.repeat(24), centralId: 'c1', taskId: 't1', taskCode: 'OPE-9', taskTitle: 'T', stage: 'implementing', runState: 'running', plans: [{ version: 1, text: '# Plano v1' }], branch: 'feat/ope-9', worktreePath: '/repo/worktrees/ope-9', approvedPlanVersion: 1 })
  const created = await diagrams.create({ workbenchId: 'w'.repeat(24), centralId: 'c1', taskId: 't1', taskCode: 'OPE-9', taskTitle: 'T', version: 1, planVersion: 1, planSeq: 1, depth: 3, origin: 'auto', feedback: null, baseDiagramId: null, state: 'running', progress: { phase: 'starting', tools: 0, lastTool: null }, startedAt: new Date(), ...overrides })
  const id = String(created._id)
  return { id, controller: registerDiagram(id, 'w'.repeat(24)) }
}
const doc = (id: string) => diagrams.docs.find((item) => String(item._id) === id)!

beforeEach(() => {
  vi.clearAllMocks()
  diagrams.docs.length = 0
  workbenches.docs.length = 0
  mocks.settings = { ...DEFAULT_ARCHITECT_SETTINGS, enabled: true, agent: { agent: 'plan', model: 'anthropic/opus', variant: null, fallbacks: [] } }
})

describe('runDiagram', () => {
  it('grava o grafo saneado, audita, publica e nunca altera a mesa', async () => {
    mocks.runTurn.mockResolvedValueOnce(succeeded(graphJson()))
    const { id, controller } = await seed()
    await runDiagram(id, controller)
    const saved = doc(id)
    expect(saved.state).toBe('done')
    expect((saved.graph as { nodes: unknown[] }).nodes).toHaveLength(2)
    expect(saved.directory).toBe('/repo/worktrees/ope-9')
    expect(mocks.sessionCreate).toHaveBeenCalledWith(expect.objectContaining({ location: { directory: '/repo/worktrees/ope-9' }, metadata: expect.objectContaining({ kind: 'architect-diagram' }) }))
    const request = mocks.runTurn.mock.calls[0]![1] as { id: string; consumption: { origin: string }; text: string }
    // Id próprio: não colide com o turno vivo da implementação (chat ao vivo, reconexão).
    expect(request.id).toBe(`architect:${id}`)
    expect(request.consumption.origin).toBe('architect-agent')
    expect(request.text).toContain('# Plano v1')
    expect(request.text).toContain('Spec técnica')
    expect(mocks.instructionsPut.mock.calls[0]![0]).toEqual(expect.objectContaining({ value: expect.stringContaining('Camadas do Opex: app/features/lib') }))
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ entidade: 'ArquiteturaPlano', depois: expect.objectContaining({ estado: 'done' }) }))
    expect(mocks.publish).toHaveBeenCalledWith('architect-diagram-updated', { workbenchId: 'w'.repeat(24), diagramId: id })
    expect(mocks.workbenchUpdate).not.toHaveBeenCalled()
    expect(mocks.sessionRemove).toHaveBeenCalledWith({ sessionID: 'arch-1' }, expect.anything())
    expect(isDiagramLive(id)).toBe(false)
  })

  it('sem o worktree no host, lê a base do repositório', async () => {
    mocks.shell.mockResolvedValueOnce({ exitCode: 128, status: 'completed', output: 'fatal: not a git repository' })
    mocks.runTurn.mockResolvedValueOnce(succeeded(graphJson()))
    const { id, controller } = await seed()
    await runDiagram(id, controller)
    expect(doc(id).directory).toBe('/repo')
    expect((mocks.runTurn.mock.calls[0]![1] as { text: string }).text).toContain('base do repositório em /repo')
  })

  it('resposta inválida: pede a correção uma vez e grava a segunda resposta', async () => {
    mocks.runTurn.mockResolvedValueOnce(succeeded('sem json nenhum')).mockResolvedValueOnce(succeeded(graphJson()))
    const { id, controller } = await seed()
    await runDiagram(id, controller)
    expect(mocks.runTurn).toHaveBeenCalledTimes(2)
    expect((mocks.runTurn.mock.calls[1]![1] as { text: string }).text).toContain('não pôde ser lida')
    expect(doc(id).state).toBe('done')
    expect(doc(id).repaired).toBe(true)
  })

  it('duas respostas inválidas: falha sem tocar a mesa', async () => {
    mocks.runTurn.mockResolvedValue(succeeded('```json\n{"nodes": []}\n```'))
    const { id, controller } = await seed()
    await runDiagram(id, controller)
    expect(mocks.runTurn).toHaveBeenCalledTimes(2)
    expect(doc(id).state).toBe('failed')
    expect(String(doc(id).error)).toContain('nova tentativa')
    expect(mocks.workbenchUpdate).not.toHaveBeenCalled()
  })

  it('falha ou tempo esgotado do agente vira "failed" e a sessão pendente é guardada quando não exclui', async () => {
    mocks.runTurn.mockResolvedValueOnce({ outcome: 'failed', text: '', message: 'Tempo esgotado', costUsd: 0, durationMs: 10 })
    mocks.sessionRemove.mockRejectedValueOnce(new Error('offline'))
    const { id, controller } = await seed()
    await runDiagram(id, controller)
    expect(doc(id).state).toBe('failed')
    expect(doc(id).error).toBe('Tempo esgotado')
    expect(doc(id).pendingSessionDeletion).toBe('arch-1')
    expect(mocks.workbenchUpdate).not.toHaveBeenCalled()
  })

  it('o teto do nível de profundidade é aplicado ao grafo gravado', async () => {
    const nodes = [{ id: 'objective', label: 'O', kind: 'objective' }, ...Array.from({ length: 15 }, (_, index) => ({ id: `n${index}`, label: `N${index}`, kind: 'module', status: 'existing' }))]
    mocks.runTurn.mockResolvedValueOnce(succeeded(graphJson(nodes, [])))
    const { id, controller } = await seed({ depth: 1 })
    await runDiagram(id, controller)
    expect((doc(id).graph as { nodes: unknown[] }).nodes).toHaveLength(8)
    expect(doc(id).trimmed).toEqual({ nodes: 8, edges: 0 })
  })

  it('resultado atrasado de um plano antigo é descartado', async () => {
    mocks.runTurn.mockImplementationOnce(async () => {
      // Durante a geração, o plano v2 foi aprovado.
      Object.assign(workbenches.docs[0]!, { plans: [{ version: 1, text: 'v1' }, { version: 2, text: 'v2' }], approvedPlanVersion: 2 })
      return succeeded(graphJson())
    })
    const { id, controller } = await seed()
    await runDiagram(id, controller)
    expect(doc(id).state).toBe('superseded')
    expect(doc(id).graph ?? null).toBeNull()
  })

  it('abortada por um plano mais novo vira "superseded"; pela exclusão da mesa, "interrupted"', async () => {
    mocks.runTurn.mockImplementation(async (_client: unknown, request: { signal: AbortSignal }) => {
      abortWorkbenchDiagrams('w'.repeat(24), (mocks as unknown as { reason: 'superseded' | 'deleted' }).reason)
      return { outcome: request.signal.aborted ? 'interrupted' : 'succeeded', text: '', message: 'Interrompido', costUsd: 0, durationMs: 1 }
    })
    ;(mocks as unknown as { reason: string }).reason = 'superseded'
    const first = await seed()
    await runDiagram(first.id, first.controller)
    expect(doc(first.id).state).toBe('superseded')
    ;(mocks as unknown as { reason: string }).reason = 'deleted'
    workbenches.docs.length = 0
    const second = await seed()
    await runDiagram(second.id, second.controller)
    expect(doc(second.id).state).toBe('interrupted')
    expect(doc(second.id).error).toBe('A mesa foi excluída durante a geração')
  })
})
