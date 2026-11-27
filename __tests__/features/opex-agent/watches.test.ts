import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryModel, type Doc } from "../../helpers/memory-model"

/**
 * Observação de eventos do Agente Opex (OPE-194): assinatura no escopo, disparo atômico (um evento =
 * um acordar), entrega numa sessão livre ou ocupada, vencidas pelo tick, prévia que só reserva,
 * recuperação de entrega perdida e o portal. Banco em memória; o runner real com o modelo falso.
 */

const mocks = vi.hoisted(() => ({
  parts: [] as unknown[],
  gate: null as Promise<void> | null,
  streamText: vi.fn(),
  publishAppEvent: vi.fn(async () => {}),
  publishToChannels: vi.fn(async () => {}),
  recordAudit: vi.fn(async () => {}),
  available: true,
  preview: false,
  clientActorFor: vi.fn(),
  assertClientEnabled: vi.fn(async () => ({ enabled: true, disabledTools: [], enabledOptInTools: [] })),
  enabledNames: vi.fn(async () => ({ names: ['watch_event', 'list_watches'], config: {} })),
  clientTasks: [] as { id: string; code: string }[],
}))

vi.mock('ai', () => ({
  isLoopFinished: () => () => false,
  dynamicTool: (def: unknown) => def,
  streamText: (options: unknown) => {
    mocks.streamText(options)
    return {
      fullStream: (async function* () {
        if (mocks.gate) await mocks.gate
        for (const part of mocks.parts) yield part
      })(),
      responseMessages: Promise.resolve([{ role: 'assistant', content: 'Feito.' }]),
    }
  },
}))
vi.mock('@nandobfer/integracoes/modules/integrations/ia/ai/stream', () => ({
  prepareModel: async () => ({ model: { id: 'modelo' }, takeStepCost: () => null, dispose: async () => {} }),
  samplingOptions: () => ({}),
  describeAiError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}))
vi.mock('@nandobfer/integracoes/modules/integrations/ia/ai/consumption', () => ({ recordAiConsumption: async () => {} }))
vi.mock("@/lib/db", () => ({ dbConnect: async () => {}, recordAudit: mocks.recordAudit, AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', ABORTAR: 'ABORTAR', EXECUTAR: 'EXECUTAR' } }))
vi.mock("@/lib/pusher/channels", () => ({ publishAppEvent: mocks.publishAppEvent, publishToChannels: mocks.publishToChannels }))
vi.mock("@/lib/instance", () => ({ isPreviewInstance: () => mocks.preview, INSTANCE_ID: 'teste' }))
vi.mock("@/lib/storage/s3", () => ({ getFileObject: vi.fn(), getUploadUrl: vi.fn(), headFile: vi.fn(), copyFile: vi.fn(), deleteFile: vi.fn(), storageErrorInfo: () => ({ kind: 'unavailable', httpStatus: null, code: null }) }))
vi.mock("@/features/auth/server/context", () => ({ clientActorFor: mocks.clientActorFor }))

function opexModel() {
  const model = memoryModel()
  const base = model.findOneAndUpdate
  return Object.assign(model, {
    createIndexes: async () => {},
    findOneAndUpdate: (filter: Doc, update: Doc, options?: { new?: boolean }) => ({
      lean: async () => {
        const [found] = (await model.find(filter).lean()) as Doc[]
        if (!found) return null
        const before = { ...found }
        const after = await base(filter, update).lean()
        return options?.new === false ? before : after
      },
    }),
    findByIdAndUpdate: (id: string, update: Doc) => base({ _id: id }, update),
  })
}
const store = vi.hoisted(() => ({ sessions: null as unknown, messages: null as unknown, jobs: null as unknown, watches: null as unknown, facts: null as unknown, tasks: null as unknown, projects: null as unknown, workbenches: null as unknown, runs: null as unknown, envs: null as unknown }))
vi.mock("@/lib/db/models/Opex", () => {
  store.sessions = opexModel()
  store.messages = opexModel()
  store.jobs = opexModel()
  store.watches = opexModel()
  store.facts = opexModel()
  return { OpexSession: store.sessions, OpexMessage: store.messages, OpexPendingAction: opexModel(), OpexFile: opexModel(), OpexJob: store.jobs, OpexWatch: store.watches, OpexWatchFact: store.facts, OpexMcpServer: opexModel() }
})
vi.mock("@/lib/db/models/Orcamento", () => ({ OrcamentoClient: memoryModel() }))
vi.mock("@/lib/db/models/User", () => ({ User: memoryModel() }))
vi.mock("@/lib/db/models/DevTask", () => {
  store.tasks = memoryModel()
  return { DevTask: store.tasks }
})
vi.mock("@/lib/db/models/Project", () => {
  store.projects = memoryModel()
  return { Project: store.projects }
})
vi.mock("@/lib/db/models/Agentic", () => {
  store.workbenches = memoryModel()
  return { AgenticWorkbench: store.workbenches }
})
vi.mock("@/lib/db/models/RoutineAgent", () => {
  const agents = memoryModel()
  agents.docs.push({ _id: 'a'.repeat(24), name: 'Vagas' })
  store.runs = memoryModel()
  return { RoutineAgent: agents, RoutineRun: store.runs }
})
vi.mock("@/features/environments/server/models", () => {
  store.envs = memoryModel()
  return { Environment: store.envs }
})
vi.mock("@/features/environments/server/service", () => ({
  resolveEnvironmentRef: async (ref: string) => (store.envs as ReturnType<typeof memoryModel>).docs.find((doc) => doc.slug === ref) ?? null,
}))
vi.mock("@/features/tasks/server/columns", () => ({
  getBoard: async () => ({ columns: [{ key: 'doing', name: 'Em andamento' }, { key: 'review', name: 'Revisão' }, { key: 'done', name: 'Concluído' }] }),
}))
vi.mock("@/features/opex-agent/server/tools/helpers", () => ({
  resolveTask: async (ref: string) => {
    const task = (store.tasks as ReturnType<typeof memoryModel>).docs.find((doc) => doc.code === ref || String(doc._id) === ref)
    if (!task) throw new Error(`Tarefa "${ref}" não encontrada.`)
    return { id: String(task._id), task: null }
  },
}))
vi.mock("@/features/orcamentos/server/portal", () => ({ listClientTasks: async () => ({ tasks: mocks.clientTasks }) }))
vi.mock("@/features/ai/server/agent-memory-context", async () => (await import("../../helpers/memory-context")).memoryContextModule())
vi.mock("@/features/ai/server/self-memory/settings", async () => (await import("../../helpers/memory-context")).selfMemorySettingsModule())
vi.mock("@/features/opex-agent/server/settings", () => ({
  loadOpexSettings: async () => ({
    settings: { enabled: true, main: { provider: 'anthropic', model: 'claude-x', variant: null, temperature: null, maxOutputTokens: null }, title: { provider: null, model: null, variant: null }, instructions: 'Seja útil', titleInstructions: 'T', disabledTools: [], confirmationOverrides: {}, files: { maxPerMessage: 5, maxSizeMb: 10 } },
    isDefault: false,
    updatedAt: null,
  }),
  opexAvailability: async () => (mocks.available ? { available: true, reason: null } : { available: false, reason: 'Agente desativado' }),
}))
vi.mock("@/features/opex-agent/server/titler", () => ({ refreshSessionTitle: async () => {} }))
vi.mock("@/features/opex-agent/server/confirmations", () => ({ requestConfirmation: vi.fn(), refreshConfirmations: async (parts: unknown[]) => parts }))
vi.mock("@/features/opex-agent/server/tools/context", () => ({ nowContext: () => ({ iso: '2026-11-25T12:00:00.000Z', local: 'quarta', timeZone: 'America/Sao_Paulo' }) }))
vi.mock("@/features/opex-agent/server/tools/registry", () => ({ enabledOpexTools: () => [], findOpexTool: () => undefined, needsConfirmation: () => false }))
vi.mock("@/features/opex-agent/server/client-tools/registry", () => ({ enabledClientOpexServerTools: () => [], findOpexClientServerTool: () => undefined }))
vi.mock("@/features/opex-agent/server/skills/turn", () => ({ ownerSkillsForTurn: async () => ({ catalog: [], tools: [] }) }))
// Tick do agendador real (`runSchedulerTick`): só os outros ganchos do tick ficam de fora.
vi.mock("@/lib/integrations/runtime", () => ({ getIntegrationConfig: async () => ({ schedulerEnabled: true, jobs: [], cronSecret: '' }), getInternalBaseUrl: async () => 'http://localhost' }))
vi.mock("@/features/local-docker/server/health", () => ({ runLocalDockerHealth: async () => {} }))
vi.mock("@/features/environments/server/forwards", () => ({ runEnvironmentsTick: async () => {} }))
vi.mock("@/features/routine-agents/server/tick", () => ({ runDueRoutineAgents: async () => {} }))
vi.mock("@/features/plugins/server/service", () => ({ reconcilePluginServers: async () => {} }))
vi.mock("@/features/plugins/server/crons", () => ({ runPluginCrons: async () => {} }))
vi.mock("@/features/opex-agent/server/client-config", () => ({
  assertClientOpexEnabled: mocks.assertClientEnabled,
  assertClientToolAllowed: vi.fn(),
  enabledClientToolNamesFor: mocks.enabledNames,
}))

import { cancelOpexWatch, createOpexWatch, listOpexWatches, notifyWatchEvent, runDueOpexWatches } from "@/features/opex-agent/server/watches"
import { watchDeployFinished, watchJobSettled, watchRoutineRunSettled, watchTargetDeleted, watchTaskMoved, watchWorkbenchChanged } from "@/features/opex-agent/server/watch-events"
import { sendMessage } from "@/features/opex-agent/server/runner"
import { runSchedulerTick } from "@/lib/integrations/scheduler"
import type { OpexServerScope } from "@/features/opex-agent/server/scope"
import type { OpexWatchInput } from "@/features/opex-agent/watches"
// Modelos importados sob demanda pelo serviço: carregados aqui para a fábrica do mock popular o `store`.
import '@/lib/db/models/DevTask'
import '@/lib/db/models/Project'
import '@/lib/db/models/Agentic'
import '@/lib/db/models/RoutineAgent'
import '@/features/environments/server/models'
import '@/features/tasks/server/columns'

type Model = ReturnType<typeof opexModel>
const sessions = () => store.sessions as Model
const messages = () => store.messages as Model
const jobs = () => store.jobs as Model
const watches = () => store.watches as Model
const facts = () => store.facts as Model
const tasks = () => store.tasks as ReturnType<typeof memoryModel>
const projects = () => store.projects as ReturnType<typeof memoryModel>
const workbenches = () => store.workbenches as ReturnType<typeof memoryModel>

const NOW = new Date('2026-11-25T12:00:00.000Z')
const CLIENT = 'c'.repeat(24)
const USER = 'e'.repeat(24)
const actor = () => ({ userId: USER, displayName: 'ana', username: 'ana', email: null, client: { _id: CLIENT, name: 'ACME' }, isAdmin: false, preview: false })
const clientScope = (): OpexServerScope => ({ kind: 'client', actor: actor() as never })
const origin = (sessionId: string) => ({ actorId: 'local', sessionId })

async function newSession(owner: Record<string, unknown> = { clientId: null, userId: 'local' }): Promise<string> {
  const doc = await sessions().create({ title: 'Conversa', summary: '', titleSource: 'auto', status: 'idle', nextSeq: 1, messageCount: 0, lastMessageAt: new Date(), agent: 'opex', ...owner })
  return String(doc._id)
}

async function newTask(code = 'OPE-12', columnId = 'doing'): Promise<string> {
  const doc = await tasks().create({ code, title: 'Login', columnId, projectId: 'p1', archived: false })
  return String(doc._id)
}

const taskWatch = (patch: Partial<OpexWatchInput> = {}): OpexWatchInput => ({ target: { kind: 'task', ref: 'OPE-12' }, event: 'done', note: 'Avise o dono que a OPE-12 foi concluída', ...patch })
const eventMessages = () => messages().docs.filter((doc) => doc.kind === 'event')
const watchDoc = () => watches().docs[0]!

beforeEach(() => {
  vi.clearAllMocks()
  mocks.parts = [{ type: 'text-delta', id: 'x', text: 'Avisado.' }, { type: 'finish', finishReason: 'stop', totalUsage: {} }]
  mocks.gate = null
  mocks.available = true
  mocks.preview = false
  mocks.clientTasks = []
  mocks.clientActorFor.mockImplementation(async () => actor())
  mocks.enabledNames.mockResolvedValue({ names: ['watch_event', 'list_watches'], config: {} })
  for (const model of [sessions(), messages(), jobs(), watches(), facts()]) model.docs.splice(0)
  for (const model of [tasks(), projects(), workbenches(), store.runs as Model, store.envs as Model]) model.docs.splice(0)
  projects().docs.push({ _id: 'p1', closedColumnKey: 'done' })
})

describe('assinatura', () => {
  it('grava a observação no escopo do dono, com prazo padrão de 24 h, auditoria e evento', async () => {
    const sessionId = await newSession()
    await newTask()
    const result = await createOpexWatch(taskWatch(), origin(sessionId), undefined, NOW)
    expect(result).toMatchObject({ alreadySatisfied: false, reused: false, current: 'Coluna atual: "Em andamento".' })
    expect(watchDoc()).toMatchObject({ status: 'watching', clientId: null, userId: 'local', target: { kind: 'task', label: 'OPE-12' }, condition: { event: 'done', values: [] }, expiresAt: new Date(NOW.getTime() + 24 * 3_600_000) })
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: 'ObservacaoAgenteOpex', acao: 'CRIAR' }))
    expect(mocks.publishAppEvent).toHaveBeenCalledWith('opex-watch-updated', expect.objectContaining({ status: 'watching', sessionId }))
  })

  it('alvo inexistente não grava nada', async () => {
    const sessionId = await newSession()
    await expect(createOpexWatch(taskWatch({ target: { kind: 'task', ref: 'OPE-999' } }), origin(sessionId), undefined, NOW)).rejects.toThrow('não encontrada')
    expect(watches().docs).toHaveLength(0)
  })

  it('condição já satisfeita devolve alreadySatisfied sem assinar', async () => {
    const sessionId = await newSession()
    await newTask('OPE-12', 'done')
    const result = await createOpexWatch(taskWatch(), origin(sessionId), undefined, NOW)
    expect(result).toMatchObject({ alreadySatisfied: true, conditionText: 'chegar na coluna de conclusão' })
    expect(watches().docs).toHaveLength(0)
  })

  it('exige uma conversa do Agente Opex (sem sessão, ou sessão do Maddox, é recusado)', async () => {
    await newTask()
    await expect(createOpexWatch(taskWatch(), { actorId: 'local', sessionId: '' }, undefined, NOW)).rejects.toMatchObject({ code: 'OPEX_WATCH_SESSION_REQUIRED' })
    const maddox = await newSession({ clientId: null, userId: 'local', agent: 'maddox' })
    await expect(createOpexWatch(taskWatch(), origin(maddox), undefined, NOW)).rejects.toMatchObject({ code: 'OPEX_WATCH_SESSION_REQUIRED' })
  })

  it('a mesma observação ativa na sessão é reaproveitada; o limite por sessão é 10', async () => {
    const sessionId = await newSession()
    await newTask()
    await createOpexWatch(taskWatch(), origin(sessionId), undefined, NOW)
    const again = await createOpexWatch(taskWatch({ note: 'Nova nota' }), origin(sessionId), undefined, NOW)
    expect(again).toMatchObject({ reused: true, watch: { note: 'Nova nota' } })
    expect(watches().docs).toHaveLength(1)

    for (let index = 0; index < 9; index++) await watches().create({ sessionId, status: 'watching', clientId: null, userId: 'local', target: { kind: 'job', id: `j${index}` }, condition: { event: 'finished', values: [] } })
    await expect(createOpexWatch(taskWatch({ event: 'column_changed' }), origin(sessionId), undefined, NOW)).rejects.toMatchObject({ code: 'OPEX_WATCH_LIMIT' })
  })

  it('portal: só tarefas do próprio cliente; mesa e rotineiro são recusados', async () => {
    const sessionId = await newSession({ clientId: CLIENT, userId: USER })
    const taskId = await newTask()
    await expect(createOpexWatch(taskWatch(), origin(sessionId), clientScope(), NOW)).rejects.toMatchObject({ code: 'OPEX_WATCH_TARGET_NOT_FOUND' })
    await expect(createOpexWatch(taskWatch({ target: { kind: 'workbench', ref: 'OPE-12' }, event: 'waiting_user' }), origin(sessionId), clientScope(), NOW)).rejects.toMatchObject({ code: 'OPEX_WATCH_TARGET_UNSUPPORTED' })
    mocks.clientTasks = [{ id: taskId, code: 'OPE-12' }]
    await createOpexWatch(taskWatch(), origin(sessionId), clientScope(), NOW)
    expect(watchDoc()).toMatchObject({ clientId: CLIENT, userId: USER })
  })

  it('cancelar só vale para a observação ativa (409 depois) e o portal não vê a do dono', async () => {
    const sessionId = await newSession()
    await newTask()
    await createOpexWatch(taskWatch(), origin(sessionId), undefined, NOW)
    const id = String(watchDoc()._id)
    await expect(cancelOpexWatch(id, USER, clientScope(), NOW)).rejects.toMatchObject({ code: 'OPEX_WATCH_NOT_FOUND' })
    const canceled = await cancelOpexWatch(id, 'local', undefined, NOW)
    expect(canceled.status).toBe('canceled')
    expect(watchDoc().purgeAt).toBeInstanceOf(Date)
    await expect(cancelOpexWatch(id, 'local', undefined, NOW)).rejects.toMatchObject({ code: 'OPEX_WATCH_NOT_ACTIVE' })
  })
})

const AT = new Date(NOW.getTime() + 60_000)
const task12 = (id: string) => ({ id, code: 'OPE-12', projectId: 'p1' })
/** Espera os fatos gravados pelas fontes serem processados (o disparo roda em segundo plano). */
const settleFacts = () => vi.waitFor(() => expect(facts().docs.every((doc) => doc.status === 'done')).toBe(true), { timeout: 5_000 })
/** Conteúdo que o modelo (simulado) recebeu em cada chamada. */
const modelInputs = () => mocks.streamText.mock.calls.map((call) => JSON.stringify((call as [{ messages: unknown }])[0].messages))

describe('disparo e entrega', () => {
  it('critério de aceite: a tarefa vai para Concluído duas vezes e o agente acorda UMA vez, sem job; o modelo recebe o lembrete', async () => {
    const sessionId = await newSession()
    const taskId = await newTask()
    await createOpexWatch(taskWatch(), origin(sessionId), undefined, NOW)

    await watchTaskMoved(task12(taskId), 'review', 'done', AT)
    await settleFacts()
    // O mesmo fato de novo (reprocessado pelo tick): a reserva atômica não acorda outra vez.
    await facts().create({ kind: 'task', targetId: taskId, source: { type: 'task_moved', code: 'OPE-12', projectId: 'p1', from: 'review', to: 'done' }, at: AT, status: 'pending', attempts: 0, leaseUntil: null })
    await runDueOpexWatches(AT)
    await watchTaskMoved(task12(taskId), 'review', 'done', AT)
    await vi.waitFor(() => expect(watchDoc().status).toBe('woken'), { timeout: 5_000 })
    await settleFacts()

    expect(eventMessages()).toHaveLength(1)
    const message = eventMessages()[0]!
    expect(message).toMatchObject({ role: 'user', text: 'Evento · OPE-12 foi para Concluído', watch: { ids: [String(watchDoc()._id)], label: 'tarefa OPE-12' } })
    // O que chegou ao modelo no turno acordado (não só o que foi gravado).
    expect(mocks.streamText).toHaveBeenCalledTimes(1)
    const sent = modelInputs()[0]!
    expect(sent).toContain('<system-reminder>')
    expect(sent).toContain('A tarefa OPE-12 mudou de coluna: \\"Revisão\\" → \\"Concluído\\" (coluna de conclusão).')
    expect(sent).toContain('O que você combinou fazer: Avise o dono que a OPE-12 foi concluída')
    expect(sent).toContain('não agende job')
    expect(watchDoc()).toMatchObject({ status: 'woken', outcome: 'event', messageId: expect.anything() })
    expect(jobs().docs).toHaveLength(0)
    expect(mocks.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: 'ObservacaoAgenteOpex', acao: 'EXECUTAR', depois: expect.objectContaining({ resultado: 'evento' }) }))
  })

  it('mudança que não casa com a condição não acorda; alvo sem observação não grava fato', async () => {
    const sessionId = await newSession()
    const taskId = await newTask()
    await watchTaskMoved(task12(taskId), 'doing', 'review', AT)
    expect(facts().docs).toHaveLength(0)
    await createOpexWatch(taskWatch(), origin(sessionId), undefined, NOW)
    await watchTaskMoved(task12(taskId), 'doing', 'review', AT)
    await settleFacts()
    expect(watchDoc().status).toBe('watching')
    expect(eventMessages()).toHaveLength(0)
  })

  it('sessão respondendo: a notificação espera e o fim do turno real a entrega (sem drenar a fila no teste)', async () => {
    const sessionId = await newSession()
    const taskId = await newTask()
    await createOpexWatch(taskWatch(), origin(sessionId), undefined, NOW)
    let release!: () => void
    mocks.gate = new Promise<void>((resolve) => (release = resolve))
    await sendMessage(sessionId, { text: 'Oi' }, 'local')

    await watchTaskMoved(task12(taskId), 'review', 'done', AT)
    await vi.waitFor(() => expect(watchDoc().status).toBe('delivering'), { timeout: 5_000 })
    expect(eventMessages()).toHaveLength(0)

    release()
    await vi.waitFor(() => expect(watchDoc().status).toBe('woken'), { timeout: 5_000 })
    expect(eventMessages()).toHaveLength(1)
    expect(mocks.streamText).toHaveBeenCalledTimes(2)
    expect(modelInputs()[1]).toContain('<system-reminder>')
  })

  it('alvo excluído acorda o agente com o desfecho e encerra a observação', async () => {
    const sessionId = await newSession()
    const taskId = await newTask()
    await createOpexWatch(taskWatch(), origin(sessionId), undefined, NOW)
    await watchTargetDeleted('task', taskId, 'OPE-12', AT)
    await vi.waitFor(() => expect(watchDoc().status).toBe('canceled'), { timeout: 5_000 })
    expect(watchDoc()).toMatchObject({ outcome: 'target_deleted', error: 'O alvo foi excluído' })
    expect(eventMessages()[0]).toMatchObject({ text: 'Alvo excluído · tarefa OPE-12' })
  })

  it('na prévia do Opex só reserva; o tick da instância principal entrega', async () => {
    const sessionId = await newSession()
    const taskId = await newTask()
    await createOpexWatch(taskWatch(), origin(sessionId), undefined, NOW)
    mocks.preview = true
    await watchTaskMoved(task12(taskId), 'review', 'done', AT)
    await settleFacts()
    expect(watchDoc().status).toBe('triggered')
    expect(eventMessages()).toHaveLength(0)

    mocks.preview = false
    expect(await runDueOpexWatches(NOW)).toMatchObject({ delivered: 1 })
    await vi.waitFor(() => expect(watchDoc().status).toBe('woken'), { timeout: 5_000 })
  })

  it('vencida: o tick acorda o agente avisando que expirou (sem o evento)', async () => {
    const sessionId = await newSession()
    await newTask()
    await createOpexWatch(taskWatch({ expiresInHours: 1 }), origin(sessionId), undefined, NOW)
    await runDueOpexWatches(new Date(NOW.getTime() + 30 * 60_000))
    expect(watchDoc().status).toBe('watching')

    expect(await runDueOpexWatches(new Date(NOW.getTime() + 2 * 3_600_000))).toMatchObject({ expired: 1 })
    await vi.waitFor(() => expect(watchDoc().status).toBe('expired'), { timeout: 5_000 })
    const message = eventMessages()[0]!
    expect(message.text).toBe('Observação expirada · OPE-12')
    expect(JSON.parse(message.modelMessages as string)[0].content).toContain('venceu')
  })

  it('agente do dono indisponível: volta para "disparada" e entrega depois', async () => {
    const sessionId = await newSession()
    const taskId = await newTask()
    await createOpexWatch(taskWatch(), origin(sessionId), undefined, NOW)
    mocks.available = false
    await watchTaskMoved(task12(taskId), 'review', 'done', AT)
    await settleFacts()
    expect(watchDoc().status).toBe('triggered')
    mocks.available = true
    await runDueOpexWatches(NOW)
    await vi.waitFor(() => expect(watchDoc().status).toBe('woken'), { timeout: 5_000 })
  })

  it('portal com a observação desligada para o cliente: encerra com erro, sem turno', async () => {
    const sessionId = await newSession({ clientId: CLIENT, userId: USER })
    const taskId = await newTask()
    mocks.clientTasks = [{ id: taskId, code: 'OPE-12' }]
    await createOpexWatch(taskWatch(), origin(sessionId), clientScope(), NOW)
    mocks.enabledNames.mockResolvedValue({ names: [], config: {} })
    await watchTaskMoved(task12(taskId), 'review', 'done', AT)
    await vi.waitFor(() => expect(watchDoc()).toMatchObject({ status: 'error', error: 'A observação de eventos foi desativada para este cliente' }), { timeout: 5_000 })
    expect(eventMessages()).toHaveLength(0)
  })

  it('várias observações da mesma sessão disparadas juntas viram um turno só', async () => {
    const sessionId = await newSession()
    await newTask()
    await createOpexWatch(taskWatch(), origin(sessionId), undefined, NOW)
    await createOpexWatch(taskWatch({ event: 'column_changed', note: 'Outra' }), origin(sessionId), undefined, NOW)
    mocks.preview = true
    const taskId = String(tasks().docs[0]!._id)
    await notifyWatchEvent({ kind: 'task', id: taskId, label: 'OPE-12', from: { key: 'doing', name: 'Em andamento' }, to: { key: 'done', name: 'Concluído' }, done: true, at: AT }, undefined, AT)
    mocks.preview = false
    await runDueOpexWatches(AT)
    await vi.waitFor(() => expect(watches().docs.every((doc) => doc.status === 'woken')).toBe(true), { timeout: 5_000 })
    expect(eventMessages()).toHaveLength(1)
    expect(eventMessages()[0]!.text).toMatch(/^2 notificações do sistema/)
  })

  it('mesa: acorda ao parar para o usuário (prévia publicada), não numa etapa de execução', async () => {
    const sessionId = await newSession()
    const wb = await workbenches().create({ taskId: 't9', taskCode: 'OPE-9', stage: 'implementing', runState: 'running' })
    await createOpexWatch({ target: { kind: 'workbench', ref: String(wb._id) }, event: 'waiting_user', note: 'Revise a prévia' }, origin(sessionId), undefined, NOW)
    await watchWorkbenchChanged(String(wb._id), { stage: 'building', previousStage: 'implementing', runState: 'running' }, AT)
    await settleFacts()
    expect(watchDoc().status).toBe('watching')
    await watchWorkbenchChanged(String(wb._id), { stage: 'preview', previousStage: 'building', runState: 'idle' }, AT)
    await vi.waitFor(() => expect(watchDoc().status).toBe('woken'), { timeout: 5_000 })
    expect(eventMessages()[0]!.text).toBe('Evento · mesa OPE-9 em Prévia pronta')
  })

  it('execução de rotineiro, job e deploy de ambiente acordam pelo status', async () => {
    const sessionId = await newSession()
    const run = await (store.runs as Model).create({ agentId: 'a'.repeat(24), status: 'running' })
    const job = await jobs().create({ title: 'Relatório', status: 'running', clientId: null, userId: 'local' })
    await (store.envs as Model).create({ name: 'Produção', slug: 'prod' })
    await createOpexWatch({ target: { kind: 'routine_run', ref: String(run._id) }, event: 'status_in', values: ['error', 'awaiting_confirmation'], note: 'Veja o erro' }, origin(sessionId), undefined, NOW)
    await createOpexWatch({ target: { kind: 'job', ref: String(job._id) }, event: 'finished', note: 'Resuma' }, origin(sessionId), undefined, NOW)
    await createOpexWatch({ target: { kind: 'environment', ref: 'prod' }, event: 'deploy_finished', note: 'Confira' }, origin(sessionId), undefined, NOW)
    mocks.preview = true
    await watchRoutineRunSettled({ id: String(run._id), agentName: 'Vagas', status: 'completed' }, AT)
    await settleFacts()
    expect(watches().docs[0]!.status).toBe('watching')
    await watchRoutineRunSettled({ id: String(run._id), agentName: 'Vagas', status: 'awaiting_confirmation' }, AT)
    await watchJobSettled({ id: String(job._id), title: 'Relatório', status: 'error', error: 'falhou' }, AT)
    const envId = String((store.envs as Model).docs[0]!._id)
    await watchDeployFinished(envId, { status: 'success', error: null }, AT)
    await settleFacts()
    expect(watches().docs.map((doc) => doc.status)).toEqual(['triggered', 'triggered', 'triggered'])
    expect(watches().docs.map((doc) => (doc.event as { summary: string }).summary)).toEqual([
      'A execução do rotineiro Vagas ficou "Aguardando confirmação".',
      'O job "Relatório" terminou como "Falhou": falhou.',
      'O deploy do ambiente Produção terminou: "Concluído".',
    ])
  })

  it('lista do dono filtra ativas/encerradas e por sessão', async () => {
    const sessionId = await newSession()
    await newTask()
    await createOpexWatch(taskWatch(), origin(sessionId), undefined, NOW)
    expect(await listOpexWatches({ filter: 'active' })).toHaveLength(1)
    expect(await listOpexWatches({ filter: 'finished' })).toHaveLength(0)
    expect(await listOpexWatches({ filter: 'all', sessionId: 'a'.repeat(24) })).toHaveLength(0)
  })
})

describe('portal: alvo transferido para outro cliente (F1)', () => {
  it('sessão livre: a observação é encerrada sem gravar o fato nem acordar o agente', async () => {
    const sessionId = await newSession({ clientId: CLIENT, userId: USER })
    const taskId = await newTask()
    mocks.clientTasks = [{ id: taskId, code: 'OPE-12' }]
    await createOpexWatch(taskWatch(), origin(sessionId), clientScope(), NOW)
    mocks.clientTasks = [] // o dono passou a tarefa para outro cliente
    await watchTaskMoved(task12(taskId), 'review', 'done', AT)
    await settleFacts()
    expect(watchDoc()).toMatchObject({ status: 'error', event: null, error: expect.stringContaining('não está mais visível') })
    expect(eventMessages()).toHaveLength(0)
    expect(mocks.streamText).not.toHaveBeenCalled()
  })

  it('sessão ocupada: transferida enquanto esperava na fila, não inicia o turno nem expõe o evento', async () => {
    const sessionId = await newSession({ clientId: CLIENT, userId: USER })
    const taskId = await newTask()
    mocks.clientTasks = [{ id: taskId, code: 'OPE-12' }]
    await createOpexWatch(taskWatch(), origin(sessionId), clientScope(), NOW)
    let release!: () => void
    mocks.gate = new Promise<void>((resolve) => (release = resolve))
    await sendMessage(sessionId, { text: 'Oi' }, USER, clientScope())
    await watchTaskMoved(task12(taskId), 'review', 'done', AT)
    await vi.waitFor(() => expect(watchDoc().status).toBe('delivering'), { timeout: 5_000 })

    mocks.clientTasks = []
    release()
    await vi.waitFor(() => expect(watchDoc()).toMatchObject({ status: 'error', event: null }), { timeout: 5_000 })
    expect(eventMessages()).toHaveLength(0)
    expect(mocks.streamText).toHaveBeenCalledTimes(1)
  })
})

describe('durabilidade e janelas (F3–F6) pelo tick do agendador', () => {
  it('o fato fica gravado antes de a fonte responder; reinício antes do disparo: o tick reprocessa e acorda', async () => {
    const sessionId = await newSession()
    const taskId = await newTask()
    await createOpexWatch(taskWatch(), origin(sessionId), undefined, NOW)
    // O processo cai logo depois de gravar o fato: o processamento em segundo plano nunca roda.
    await facts().create({ kind: 'task', targetId: taskId, source: { type: 'task_moved', code: 'OPE-12', projectId: 'p1', from: 'review', to: 'done' }, at: AT, status: 'pending', attempts: 0, leaseUntil: null })
    expect(watchDoc().status).toBe('watching')

    await runSchedulerTick(new Date(AT.getTime() + 60_000))
    await vi.waitFor(() => expect(watchDoc().status).toBe('woken'), { timeout: 5_000 })
    expect(facts().docs[0]!.status).toBe('done')
    expect(eventMessages()).toHaveLength(1)
  })

  it('a fonte espera a gravação do fato (durável ao retornar)', async () => {
    const sessionId = await newSession()
    const taskId = await newTask()
    await createOpexWatch(taskWatch(), origin(sessionId), undefined, NOW)
    await watchTaskMoved(task12(taskId), 'review', 'done', AT)
    expect(facts().docs).toHaveLength(1)
    expect(facts().docs[0]).toMatchObject({ kind: 'task', targetId: taskId, at: AT })
    await vi.waitFor(() => expect(watchDoc().status).toBe('woken'), { timeout: 5_000 })
  })

  it('reinício entre gravar a mensagem e o turno: o tick retoma o turno com a MESMA mensagem', async () => {
    const sessionId = await newSession()
    const taskId = await newTask()
    await createOpexWatch(taskWatch(), origin(sessionId), undefined, NOW)
    const watchId = String(watchDoc()._id)
    // Estado deixado pelo processo que caiu: mensagem de sistema gravada, observação "delivering", sessão presa.
    const message = await messages().create({ sessionId, seq: 1, role: 'user', kind: 'event', text: 'Evento · OPE-12 foi para Concluído', watch: { ids: [watchId], label: 'tarefa OPE-12' }, modelMessages: JSON.stringify([{ role: 'user', content: '<system-reminder>\nEvento: OPE-12\n</system-reminder>' }]), status: 'complete', files: [], parts: [] })
    Object.assign(watchDoc(), { status: 'delivering', outcome: 'event', deliveringAt: NOW, messageId: message._id, event: { summary: 'x', short: 'x', at: AT } })
    Object.assign(sessions().docs[0]!, { status: 'running', nextSeq: 3, messageCount: 2 })
    void taskId

    await runSchedulerTick(new Date(NOW.getTime() + 5 * 60_000))
    await vi.waitFor(() => expect(watchDoc().status).toBe('woken'), { timeout: 5_000 })
    expect(eventMessages()).toHaveLength(1)
    expect(mocks.streamText).toHaveBeenCalledTimes(1)
    expect(modelInputs()[0]).toContain('<system-reminder>')
    expect(messages().docs.find((doc) => doc.role === 'assistant')).toMatchObject({ seq: 2 })
  })

  it('mensagem gravada e já respondida: só encerra; sem mensagem: volta para "disparada"', async () => {
    const sessionId = await newSession()
    const base = { sessionId, status: 'delivering', deliveringAt: new Date(NOW.getTime() - 5 * 60_000), outcome: 'event', clientId: null, userId: 'local', condition: { event: 'done', values: [] }, note: 'n', since: NOW, expiresAt: new Date(NOW.getTime() + 3_600_000) }
    const lost = await watches().create({ ...base, target: { kind: 'task', id: 't', label: 'OPE-1' } })
    const answered = await watches().create({ ...base, target: { kind: 'task', id: 't2', label: 'OPE-2' } })
    await messages().create({ sessionId, seq: 1, role: 'user', kind: 'event', watch: { ids: [String(answered._id)], label: 'x' } })
    await messages().create({ sessionId, seq: 2, role: 'assistant', kind: 'message' })
    mocks.available = false
    await runSchedulerTick(NOW)
    expect(watches().docs.find((doc) => doc._id === lost._id)).toMatchObject({ status: 'triggered' })
    expect(watches().docs.find((doc) => doc._id === answered._id)).toMatchObject({ status: 'woken' })
  })

  it('a transição acontece entre a leitura inicial e a gravação: devolve alreadySatisfied e não fica observando', async () => {
    const sessionId = await newSession()
    await newTask()
    const create = watches().create
    watches().create = async (doc: Doc) => {
      tasks().docs[0]!.columnId = 'done' // outro pedido move a tarefa enquanto a assinatura grava
      return create(doc)
    }
    try {
      const result = await createOpexWatch(taskWatch(), origin(sessionId), undefined, NOW)
      expect(result).toMatchObject({ alreadySatisfied: true, current: 'Coluna atual: "Concluído" (coluna de conclusão).' })
      expect(watches().docs).toHaveLength(0)

      tasks().docs[0]!.columnId = 'doing'
      const changed = await createOpexWatch(taskWatch({ event: 'column_changed' }), origin(sessionId), undefined, NOW)
      expect(changed).toMatchObject({ alreadySatisfied: true })
      expect(watches().docs).toHaveLength(0)
    } finally {
      watches().create = create
    }
  })

  it('evento depois do prazo, antes de o tick vencer a observação: não vale como evento', async () => {
    const sessionId = await newSession()
    const taskId = await newTask()
    await createOpexWatch(taskWatch({ expiresInHours: 1 }), origin(sessionId), undefined, NOW)
    await watchTaskMoved(task12(taskId), 'review', 'done', new Date(NOW.getTime() + 3_600_000 + 20_000))
    await settleFacts()
    expect(watchDoc().status).toBe('watching')

    await runSchedulerTick(new Date(NOW.getTime() + 3_600_000 + 60_000))
    await vi.waitFor(() => expect(watchDoc()).toMatchObject({ status: 'expired', outcome: 'expired' }), { timeout: 5_000 })
    expect(eventMessages()[0]!.text).toBe('Observação expirada · OPE-12')
  })

  it('evento dentro do prazo processado com atraso (depois do vencimento) vale como evento', async () => {
    const sessionId = await newSession()
    const taskId = await newTask()
    await createOpexWatch(taskWatch({ expiresInHours: 1 }), origin(sessionId), undefined, NOW)
    await facts().create({ kind: 'task', targetId: taskId, source: { type: 'task_moved', code: 'OPE-12', projectId: 'p1', from: 'review', to: 'done' }, at: new Date(NOW.getTime() + 30 * 60_000), status: 'pending', attempts: 0, leaseUntil: null })

    await runSchedulerTick(new Date(NOW.getTime() + 2 * 3_600_000))
    await vi.waitFor(() => expect(watchDoc()).toMatchObject({ status: 'woken', outcome: 'event' }), { timeout: 5_000 })
    expect(eventMessages()[0]!.text).toBe('Evento · OPE-12 foi para Concluído')
  })

  it('fato anterior à observação não a dispara', async () => {
    const sessionId = await newSession()
    const taskId = await newTask()
    await createOpexWatch(taskWatch({ event: 'column_changed' }), origin(sessionId), undefined, NOW)
    await watchTaskMoved(task12(taskId), 'doing', 'review', new Date(NOW.getTime() - 60_000))
    await settleFacts()
    expect(watchDoc().status).toBe('watching')
  })
})
