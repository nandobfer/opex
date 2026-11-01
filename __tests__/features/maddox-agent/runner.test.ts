import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryModel, type Doc } from '../../helpers/memory-model'
import type { TurnEvent, TurnHooks, TurnRequest } from '@/lib/ai/opencode-run'

type Scenario = (hooks: TurnHooks, request: TurnRequest) => Promise<{ outcome: 'succeeded' | 'failed' | 'interrupted'; message?: string | null }>

const mocks = vi.hoisted(() => ({
  scenario: null as unknown,
  requests: [] as unknown[],
  available: true,
  applySetup: vi.fn(async () => {}),
  createSession: vi.fn(async () => 'ses_oc'),
  refreshTitle: vi.fn(async () => {}),
  publishAppEvent: vi.fn(async () => {}),
  permissionReply: vi.fn(async () => {}),
  catalog: [{ id: 'anthropic/claude', name: 'Claude', variants: ['high'] }, { id: 'openai/gpt', name: 'GPT', variants: [] }] as { id: string; name: string; variants: string[] }[],
}))

vi.mock('@/lib/ai/opencode-run', () => ({
  runAgentTurn: async (_client: unknown, request: TurnRequest, hooks: TurnHooks) => {
    mocks.requests.push(request)
    const result = await (mocks.scenario as Scenario)(hooks, request)
    return { outcome: result.outcome, text: '', message: result.message ?? null, costUsd: 0, durationMs: 5 }
  },
}))
vi.mock('@/lib/ai/opencode-client', () => ({ getOpencodeClient: async () => ({ permission: { reply: mocks.permissionReply } }) }))
vi.mock('@/lib/ai/catalog', () => ({ listAiModels: async () => mocks.catalog }))
vi.mock('@/lib/db', () => ({ dbConnect: async () => {}, recordAudit: async () => {}, AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR', EXECUTAR: 'EXECUTAR', ABORTAR: 'ABORTAR' } }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.publishAppEvent, publishToChannels: vi.fn(async () => {}) }))
vi.mock('@/lib/storage/s3', () => ({ getFileObject: vi.fn(), getUploadUrl: vi.fn(), headFile: vi.fn(), copyFile: vi.fn(), deleteFile: vi.fn(), storageErrorInfo: () => ({ kind: 'unavailable' }) }))

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
    updateMany: async (filter: Doc, update: Doc) => {
      const found = (await model.find(filter).lean()) as Doc[]
      for (const doc of found) await model.updateOne({ _id: doc._id }, update)
      return { modifiedCount: found.length }
    },
  })
}
const store = vi.hoisted(() => ({ sessions: null as unknown, messages: null as unknown, files: null as unknown }))
vi.mock('@/lib/db/models/Opex', () => {
  store.sessions = opexModel()
  store.messages = opexModel()
  store.files = opexModel()
  return { OpexSession: store.sessions, OpexMessage: store.messages, OpexPendingAction: opexModel(), OpexFile: store.files, OpexJob: opexModel() }
})
vi.mock('@/features/auth/server/context', () => ({ clientActorFor: vi.fn() }))

const settings = {
  enabled: true,
  color: null,
  main: { model: 'anthropic/claude', variant: 'high' },
  title: { model: null, variant: null },
  instructions: 'Seja o Maddox',
  titleInstructions: 'Título',
  disabledTools: [],
  confirmationOverrides: {},
  files: { maxPerMessage: 5, maxSizeMb: 10 },
  mcpBaseUrl: 'http://opex.local',
}
vi.mock('@/features/maddox-agent/server/settings', () => ({
  loadMaddoxSettings: async () => ({ settings, isDefault: false, updatedAt: null }),
  maddoxAvailability: async () => (mocks.available ? { available: true, reason: null } : { available: false, reason: 'O OpenCode não está conectado' }),
}))
vi.mock('@/features/maddox-agent/server/opencode-session', () => ({
  ensureMaddoxMcp: async () => ({ ok: true, error: null }),
  maddoxDirectory: async () => '/home/dono',
  createOpencodeSession: mocks.createSession,
  applySessionSetup: mocks.applySetup,
  opencodeSessionExists: async () => true,
  removeOpencodeSession: async () => {},
  interruptOpencodeSession: async () => {},
}))
vi.mock('@/features/maddox-agent/server/scope-tools', () => ({ maddoxPermissionsFor: async () => [{ action: 'opex_portal_*', resource: '*', effect: 'deny' }] }))
vi.mock('@/features/maddox-agent/server/client-config', () => ({ assertClientMaddoxEnabled: vi.fn(async () => ({ enabled: true, disabledTools: [] })) }))
vi.mock('@/features/opex-agent/server/titler', () => ({ refreshSessionTitleWith: mocks.refreshTitle }))
vi.mock('@/features/ai/server/agent-memory-context', async () =>
  (await import('../../helpers/memory-context')).memoryContextModule({ 'agentes/maddox/global': ['Memória global do Maddox'], 'agentes/maddox/dono': ['Memória do dono'] }),
)
vi.mock('@/features/ai/server/self-memory/settings', async () => (await import('../../helpers/memory-context')).selfMemorySettingsModule())
const secretTool = {
  name: 'update_integration',
  group: 'integrations',
  label: 'Configurar integração',
  input: { safeParse: (value: unknown) => ({ success: true, data: value }) },
  redact: (input: { id: string; values: Record<string, string> }) => ({ id: input.id, values: Object.fromEntries(Object.keys(input.values).map((key) => [key, '[oculto]'])) }),
}
vi.mock('@/features/opex-agent/server/tools/registry', () => ({
  findOpexTool: (name: string) => (name === 'list_tasks' ? { name, group: 'tasks', label: 'Listar tarefas' } : name === 'update_integration' ? secretTool : undefined),
}))
vi.mock('@/features/opex-agent/server/client-tools/registry', () => ({ findOpexClientServerTool: () => undefined }))

import { queueMaddoxFollowUp, sendMaddoxMessage } from '@/features/maddox-agent/server/runner'
import { MADDOX_OWNER_SCOPE } from '@/features/maddox-agent/server/sessions'
import { decideMaddoxPermission } from '@/features/maddox-agent/server/requests'
import { subscribeSession } from '@/features/opex-agent/server/hub'
import type { OpexStreamLine } from '@/features/opex-agent/types'

type Model = ReturnType<typeof opexModel>
const sessions = () => store.sessions as Model
const messages = () => store.messages as Model

async function newSession(extra: Doc = {}): Promise<string> {
  const doc = await sessions().create({ title: 'Nova sessão', summary: '', titleSource: 'auto', status: 'idle', nextSeq: 1, messageCount: 0, lastMessageAt: new Date(), clientId: null, userId: 'local', agent: 'maddox', opencodeSessionId: null, modelOverride: null, pendingRequests: [], ...extra })
  return String(doc._id)
}

function collect(sessionId: string): { lines: OpexStreamLine[]; ended: Promise<void> } {
  const lines: OpexStreamLine[] = []
  const ended = new Promise<void>((resolve) => {
    const unsubscribe = subscribeSession(sessionId, (line) => {
      lines.push(line)
      if (line.type === 'turn-end') {
        unsubscribe()
        resolve()
      }
    })
  })
  return { lines, ended }
}

const emit = (hooks: TurnHooks, event: TurnEvent) => hooks.publish?.(event)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requests = []
  mocks.available = true
  for (const model of [sessions(), messages()]) model.docs.splice(0)
})

describe('runner do Agente Maddox (OpenCode)', () => {
  it('roda o turno no OpenCode: texto, raciocínio e ferramentas do Opex e nativas no chat; grava a resposta, o modelo e os tokens', async () => {
    const sessionId = await newSession()
    mocks.scenario = (async (hooks) => {
      emit(hooks, { type: 'reasoning', text: 'vou listar' })
      emit(hooks, { type: 'tool', id: 't1', name: 'opex_app_list_tasks', state: 'running', input: 'crm' })
      emit(hooks, { type: 'tool', id: 't1', name: 'opex_app_list_tasks', state: 'done', input: 'crm', output: '{"total":2}' })
      emit(hooks, { type: 'tool', id: 't2', name: 'bash', state: 'running', input: 'ls' })
      emit(hooks, { type: 'tool', id: 't2', name: 'bash', state: 'error', input: 'ls', output: null, error: 'falhou' })
      emit(hooks, { type: 'text', text: 'Achei 2 tarefas.' })
      await hooks.onStep?.({ costUsd: 0, tokens: { input: 40, output: 10, reasoning: 5 } })
      return { outcome: 'succeeded' }
    }) satisfies Scenario
    const { lines, ended } = collect(sessionId)
    await sendMaddoxMessage(sessionId, { text: 'Quais tarefas do CRM?' }, 'local', MADDOX_OWNER_SCOPE)
    await ended
    await vi.waitFor(() => expect(mocks.refreshTitle).toHaveBeenCalled())

    const starts = lines.filter((line): line is Extract<OpexStreamLine, { type: 'tool-start' }> => line.type === 'tool-start')
    expect(starts.map((line) => [line.name, line.group, line.label])).toEqual([
      ['opex_app_list_tasks', 'tasks', 'Listar tarefas'],
      ['bash', 'opencode-native', 'bash'],
    ])
    const request = mocks.requests[0] as TurnRequest
    expect(request).toMatchObject({ sessionId: 'ses_oc', agent: { agent: null, model: 'anthropic/claude', variant: 'high' }, text: 'Quais tarefas do CRM?', consumption: { origin: 'maddox-agent', subject: sessionId } })
    const instructions = (mocks.applySetup.mock.calls[0] as unknown[])[2] as { instructions: string }
    expect(instructions.instructions).toContain('Seja o Maddox')
    expect(instructions.instructions).toContain('Memória global do Maddox')
    expect(instructions.instructions).toContain('Memória do dono')

    const saved = messages().docs.find((doc) => doc.role === 'assistant')!
    expect(saved).toMatchObject({ status: 'complete', text: 'Achei 2 tarefas.', model: 'anthropic/claude (high)', usage: { inputTokens: 40, outputTokens: 10, totalTokens: 55 } })
    expect(sessions().docs[0]).toMatchObject({ status: 'idle', opencodeSessionId: 'ses_oc' })
    expect(mocks.refreshTitle).toHaveBeenCalledWith(sessionId, expect.objectContaining({ provider: 'opencode', model: 'anthropic/claude', origin: 'maddox-title' }), expect.objectContaining({ userText: 'Quais tarefas do CRM?', assistantText: 'Achei 2 tarefas.' }))
  })

  it('entrada de ferramenta do Opex com segredo sai com o redact: nem o chat ao vivo nem o histórico guardam o valor', async () => {
    const sessionId = await newSession()
    const rawInput = { id: 'github', values: { token: 'ghp_SEGREDO' } }
    mocks.scenario = (async (hooks) => {
      emit(hooks, { type: 'tool', id: 't1', name: 'opex_app_update_integration', state: 'running' })
      // O resumo cru do OpenCode também pode trazer o segredo: ele nunca é usado nas ferramentas do Opex.
      emit(hooks, { type: 'tool', id: 't1', name: 'opex_app_update_integration', state: 'running', input: 'ghp_SEGREDO', rawInput })
      emit(hooks, { type: 'tool', id: 't1', name: 'opex_app_update_integration', state: 'done', input: 'ghp_SEGREDO', rawInput, output: '{"ok":true}' })
      return { outcome: 'succeeded' }
    }) satisfies Scenario
    const { lines, ended } = collect(sessionId)
    await sendMaddoxMessage(sessionId, { text: 'Grave o token' }, 'local', MADDOX_OWNER_SCOPE)
    await ended
    const published = JSON.stringify(lines)
    expect(published).not.toContain('ghp_SEGREDO')
    expect(published).toContain('[oculto]')
    const saved = JSON.stringify(messages().docs.find((doc) => doc.role === 'assistant')!.parts)
    expect(saved).not.toContain('ghp_SEGREDO')
    expect(saved).toContain('[oculto]')
  })

  it('permissão do OpenCode deixa a sessão aguardando; Confirmar responde "once" e o turno continua', async () => {
    const sessionId = await newSession()
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    mocks.scenario = (async (hooks) => {
      emit(hooks, { type: 'tool', id: 't1', name: 'bash', state: 'running', input: 'rm -rf build' })
      await hooks.onPermission?.({ id: 'p1', action: 'bash', resources: ['rm -rf build'], message: null, toolCallId: 't1' })
      await gate
      await hooks.onPermissionClosed?.('p1')
      emit(hooks, { type: 'tool', id: 't1', name: 'bash', state: 'done', input: 'rm -rf build', output: '' })
      return { outcome: 'succeeded' }
    }) satisfies Scenario
    const { lines, ended } = collect(sessionId)
    await sendMaddoxMessage(sessionId, { text: 'Limpe o build' }, 'local', MADDOX_OWNER_SCOPE)
    await vi.waitFor(() => expect(sessions().docs[0]).toMatchObject({ status: 'awaiting_confirmation' }))
    expect(sessions().docs[0].pendingRequests).toEqual([expect.objectContaining({ id: 'p1', kind: 'permission', partId: 't1' })])
    expect(lines.find((line) => line.type === 'tool-confirmation')).toMatchObject({ id: 't1', confirmation: { actionId: 'p1', status: 'pending' } })

    const decided = await decideMaddoxPermission('p1', 'confirm', 'local', MADDOX_OWNER_SCOPE)
    expect(decided.status).toBe('confirmed')
    expect(mocks.permissionReply).toHaveBeenCalledWith({ sessionID: 'ses_oc', requestID: 'p1', decision: 'once' })
    expect(sessions().docs[0]).toMatchObject({ status: 'running', pendingRequests: [] })
    release()
    await ended
    const tool = (messages().docs.find((doc) => doc.role === 'assistant')!.parts as { type: string; confirmation?: { status: string } }[]).find((part) => part.type === 'tool')
    expect(tool?.confirmation?.status).toBe('confirmed')
  })

  it('modelo da sessão fora do catálogo: volta ao padrão e avisa no chat', async () => {
    const sessionId = await newSession({ modelOverride: { model: 'x/sumiu', variant: null } })
    mocks.scenario = (async () => ({ outcome: 'succeeded' })) satisfies Scenario
    const { ended } = collect(sessionId)
    await sendMaddoxMessage(sessionId, { text: 'oi' }, 'local', MADDOX_OWNER_SCOPE)
    await ended
    expect((mocks.requests[0] as TurnRequest).agent.model).toBe('anthropic/claude')
    expect(sessions().docs[0].modelOverride).toBeNull()
    expect(String(messages().docs.find((doc) => doc.role === 'assistant')!.text)).toContain('saiu do catálogo')
  })

  it('OpenCode fora do ar ou Maddox inativo: recusa a mensagem com o motivo em pt-BR', async () => {
    const sessionId = await newSession()
    mocks.available = false
    await expect(sendMaddoxMessage(sessionId, { text: 'oi' }, 'local', MADDOX_OWNER_SCOPE)).rejects.toMatchObject({ status: 409, message: 'O OpenCode não está conectado' })
  })

  it('sessão do Agente Opex não é aceita pelas rotas do Maddox (404)', async () => {
    const sessionId = await newSession({ agent: 'opex' })
    await expect(sendMaddoxMessage(sessionId, { text: 'oi' }, 'local', MADDOX_OWNER_SCOPE)).rejects.toMatchObject({ status: 404 })
  })

  it('turno iniciado por aviso (retomada) também atualiza o título com o que foi produzido', async () => {
    const sessionId = await newSession()
    mocks.scenario = (async (hooks) => {
      emit(hooks, { type: 'text', text: 'O deploy terminou com sucesso.' })
      return { outcome: 'succeeded' }
    }) satisfies Scenario
    const { ended } = collect(sessionId)
    await queueMaddoxFollowUp(sessionId, { kind: 'notice', text: 'Aviso: deploy concluído', display: 'Deploy concluído' })
    await ended
    await vi.waitFor(() => expect(mocks.refreshTitle).toHaveBeenCalledWith(sessionId, expect.anything(), expect.objectContaining({ userText: 'Deploy concluído', assistantText: 'O deploy terminou com sucesso.' })))
    expect(messages().docs.find((doc) => doc.role === 'user')).toMatchObject({ kind: 'notice', text: 'Deploy concluído' })
  })
})
