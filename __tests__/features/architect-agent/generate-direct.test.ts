import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Geração num provedor direto (Gemini, Anthropic, OpenAI, DeepSeek): uma chamada `streamAi` sem
 * sessão, ferramentas nem acesso ao código; o mesmo diagrama ao vivo, correção sem conversa, tokens
 * no lugar do custo, falha, tempo esgotado e cancelamento.
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
  streamAi: vi.fn(),
  getClient: vi.fn(),
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
vi.mock('@/lib/ai/stream', () => ({ streamAi: mocks.streamAi }))
vi.mock('@/lib/ai/opencode-client', () => ({
  getOpencodeClient: async () => (mocks.getClient(), {
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
import { subscribeLive } from '@/features/architect-agent/server/live-hub'
import type { ArchitectStreamLine } from '@/features/architect-agent/types'

const diagrams = ArchitectDiagram as unknown as { docs: Record<string, unknown>[]; create: (doc: Record<string, unknown>) => Promise<{ _id: string }> }
const workbenches = AgenticWorkbench as unknown as { docs: Record<string, unknown>[] }

const block = (...ops: unknown[]) => '```architect\n' + ops.map((op) => JSON.stringify(op)).join('\n') + '\n```\n'
const ideas = block(
  { op: 'meta', title: 'Arquitetura', summary: 'Resumo' },
  { op: 'node', id: 'objective', label: 'Objetivo', kind: 'objective', status: 'new' },
  { op: 'node', id: 'a', label: 'Geração do diagrama', kind: 'process', status: 'new' },
  { op: 'edge', source: 'objective', target: 'a', kind: 'flow' },
  { op: 'done' },
)
const done = { type: 'done', finishReason: 'stop', durationMs: 5, usage: { inputTokens: 1200, outputTokens: 300, totalTokens: 1500, costUsd: null } }
/** Stream do provedor: o texto em pedaços pequenos (cortando linhas no meio) e o fim. */
function answer(text: string, end: unknown = done) {
  return async function* () {
    for (let index = 0; index < text.length; index += 37) yield { type: 'delta', text: text.slice(index, index + 37) }
    if (end) yield end
  }
}

async function seed(overrides: Record<string, unknown> = {}) {
  workbenches.docs.push({ _id: 'w'.repeat(24), centralId: 'c1', taskId: 't1', taskCode: 'OPE-9', taskTitle: 'T', stage: 'implementing', runState: 'running', plans: [{ version: 1, text: '# Plano v1' }], branch: 'feat/ope-9', worktreePath: '/repo/worktrees/ope-9', approvedPlanVersion: 1 })
  const created = await diagrams.create({ workbenchId: 'w'.repeat(24), centralId: 'c1', taskId: 't1', taskCode: 'OPE-9', taskTitle: 'T', version: 1, planVersion: 1, planSeq: 1, depth: 3, origin: 'auto', feedback: null, baseDiagramId: null, state: 'running', progress: { phase: 'starting', tools: 0, lastTool: null }, usage: { costUsd: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 }, startedAt: new Date(), ...overrides })
  const id = String(created._id)
  return { id, controller: registerDiagram(id, 'w'.repeat(24)) }
}
const doc = (id: string) => diagrams.docs.find((item) => String(item._id) === id)!

beforeEach(() => {
  vi.clearAllMocks()
  diagrams.docs.length = 0
  workbenches.docs.length = 0
  mocks.settings = { ...DEFAULT_ARCHITECT_SETTINGS, enabled: true, provider: 'anthropic', timeoutMinutes: 10, agent: { agent: null, model: 'claude-sonnet', variant: 'high', fallbacks: [] } }
})

describe('runDiagram num provedor direto', () => {
  it('desenha ao vivo pelo streamAi, grava o diagrama, os tokens e o provedor, sem tocar no OpenCode', async () => {
    const lines: ArchitectStreamLine[] = []
    let streamId = ''
    // Assina o hub ao vivo quando a chamada começa (o hub abre com a geração).
    mocks.streamAi.mockImplementationOnce(async function* () {
      subscribeLive(streamId, (line) => lines.push(line))
      yield* answer(ideas)()
    })
    const { id, controller } = await seed()
    streamId = id
    await runDiagram(id, controller)
    const saved = doc(id)
    expect(saved.state).toBe('done')
    expect((saved.graph as { nodes: { label: string }[] }).nodes.map((node) => node.label)).toEqual(['Objetivo', 'Geração do diagrama'])
    // Sem OpenCode: nenhum cliente, sessão, instruções de sessão nem turno.
    expect(mocks.getClient).not.toHaveBeenCalled()
    expect(mocks.sessionCreate).not.toHaveBeenCalled()
    expect(mocks.runTurn).not.toHaveBeenCalled()
    expect(saved.sessionId ?? null).toBeNull()
    const request = mocks.streamAi.mock.calls[0]![0] as { provider: string; model: string; variant: string; instructions: string; prompt: string; consumption: { origin: string; subject: string }; signal: AbortSignal }
    expect(request).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet', variant: 'high', consumption: { origin: 'architect-agent', subject: 'w'.repeat(24) } })
    expect(request.signal).toBeInstanceOf(AbortSignal)
    expect(request.prompt).toContain('# Plano v1')
    expect(request.prompt).toContain('Você não tem acesso ao código')
    expect(request.prompt).not.toContain('/repo')
    expect(request.instructions).toContain('NÃO tem acesso ao repositório')
    // As memórias do arquiteto entram nas instruções (sem o MCP do OpenCode).
    expect(request.instructions).toContain('Camadas do Opex: app/features/lib')
    expect(saved).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet' })
    expect(saved.usage).toMatchObject({ costUsd: null, inputTokens: 1200, outputTokens: 300 })
    // O desenho chegou ao vivo, em operações, antes do fim.
    const end = lines.findIndex((line) => line.type === 'end')
    expect(end).toBeGreaterThan(0)
    expect(lines.slice(0, end).some((line) => line.type === 'ops')).toBe(true)
    expect(isDiagramLive(id)).toBe(false)
  })

  it('resposta ilegível: a correção é uma chamada nova com o pedido original e o fim da resposta anterior', async () => {
    mocks.streamAi.mockImplementationOnce(answer('não consegui desenhar ANTERIOR-FIM')).mockImplementationOnce(answer(ideas))
    const { id, controller } = await seed()
    await runDiagram(id, controller)
    expect(mocks.streamAi).toHaveBeenCalledTimes(2)
    const repair = (mocks.streamAi.mock.calls[1]![0] as { prompt: string }).prompt
    expect(repair).toContain('# Plano v1')
    expect(repair).toContain('ANTERIOR-FIM')
    expect(repair).toContain('não pôde ser lida')
    expect(repair.indexOf('ANTERIOR-FIM')).toBeLessThan(repair.indexOf('não pôde ser lida'))
    expect(doc(id).state).toBe('done')
    expect(doc(id).repaired).toBe(true)
    expect(doc(id).usage).toMatchObject({ inputTokens: 2400, outputTokens: 600 })
  })

  it('erro do provedor: a versão falha com a mensagem dele', async () => {
    mocks.streamAi.mockImplementationOnce(answer('', { type: 'error', message: 'Anthropic: chave inválida (401)' }))
    const { id, controller } = await seed()
    await runDiagram(id, controller)
    expect(doc(id).state).toBe('failed')
    expect(doc(id).error).toBe('Anthropic: chave inválida (401)')
  })

  it('tempo máximo esgotado: a versão falha com o motivo', async () => {
    mocks.settings = { ...(mocks.settings as object), timeoutMinutes: 0.0005 }
    mocks.streamAi.mockImplementationOnce(async function* (request: { signal: AbortSignal }) {
      yield { type: 'delta', text: '```architect\n' }
      await new Promise<void>((resolve) => request.signal.addEventListener('abort', () => resolve()))
    })
    const { id, controller } = await seed()
    await runDiagram(id, controller)
    expect(doc(id).state).toBe('failed')
    expect(String(doc(id).error)).toContain('tempo máximo da configuração')
  })

  it('plano novo durante a geração: aborta a chamada e descarta a versão', async () => {
    mocks.streamAi.mockImplementationOnce(async function* (request: { signal: AbortSignal }) {
      yield { type: 'delta', text: ideas.slice(0, 40) }
      abortWorkbenchDiagrams('w'.repeat(24), 'superseded')
      expect(request.signal.aborted).toBe(true)
    })
    const { id, controller } = await seed()
    await runDiagram(id, controller)
    expect(doc(id).state).toBe('superseded')
  })

  it('novo pedido no OpenCode depois de uma tentativa direta volta o custo a número', async () => {
    mocks.settings = { ...DEFAULT_ARCHITECT_SETTINGS, enabled: true, agent: { agent: 'plan', model: 'anthropic/opus', variant: null, fallbacks: [] } }
    mocks.runTurn.mockImplementationOnce(async (_client: unknown, _request: unknown, hooks: { publish: (event: unknown) => void }) => {
      hooks.publish({ type: 'text', text: ideas })
      return { outcome: 'succeeded', text: ideas, message: null, costUsd: 0.02, durationMs: 10 }
    })
    const { id, controller } = await seed({ provider: 'anthropic', usage: { costUsd: null, inputTokens: 10, outputTokens: 5, reasoningTokens: 0 } })
    await runDiagram(id, controller)
    expect(mocks.streamAi).not.toHaveBeenCalled()
    expect(mocks.runTurn).toHaveBeenCalledTimes(1)
    expect(doc(id)).toMatchObject({ state: 'done', provider: 'opencode', model: 'anthropic/opus' })
    expect(doc(id).usage).toMatchObject({ costUsd: 0 })
  })
})

describe('fonte: todos os planos da mesa (provedor direto)', () => {
  it('três planos: o pedido leva os três, na ordem, e as instruções deixam o processo de entrega de fora', async () => {
    mocks.streamAi.mockImplementationOnce(answer(ideas))
    const { id, controller } = await seed({ planVersion: 3 })
    Object.assign(workbenches.docs[0]!, {
      plans: [
        { version: 1, text: '# Calendário de trabalhos', feedback: null },
        { version: 2, text: '# Trazer a main para a branch', feedback: 'traga a main' },
        { version: 3, text: '# ChunkLoadError na prévia', feedback: 'a prévia quebrou' },
      ],
    })
    await runDiagram(id, controller)
    const request = mocks.streamAi.mock.calls[0]![0] as { prompt: string; instructions: string }
    const order = ['# Calendário de trabalhos', '# Trazer a main para a branch', '# ChunkLoadError na prévia'].map((part) => request.prompt.indexOf(part))
    expect(order.every((index) => index >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(request.instructions).toContain('processo de ENTREGA')
    expect(doc(id).state).toBe('done')
  })
})
