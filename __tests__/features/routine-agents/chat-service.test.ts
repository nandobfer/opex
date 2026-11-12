import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryModel } from '../../helpers/memory-model'

/**
 * Serviço da conversa com um agente rotineiro (OPE-160): cada agente só enxerga as próprias conversas
 * (sessão de outro agente → 404), criar uma conversa com o agente indisponível recusa antes de gravar a
 * sessão e o status devolve o motivo.
 */

const store = vi.hoisted(() => ({ sessions: null as unknown, agents: new Map<string, Record<string, unknown>>(), sent: [] as unknown[] }))
vi.mock('@/lib/db', () => ({ dbConnect: async () => {}, recordAudit: async () => {}, AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR' } }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: vi.fn(async () => {}), publishToChannels: vi.fn(async () => {}) }))
vi.mock('@/lib/db/models/Opex', () => {
  store.sessions = memoryModel()
  return { OpexSession: store.sessions, OpexMessage: memoryModel(), OpexPendingAction: memoryModel(), OpexJob: memoryModel(), OpexFile: memoryModel() }
})
vi.mock('@/features/auth/server/context', () => ({ clientActorFor: vi.fn() }))
vi.mock('@/features/routine-agents/server/shared', async () => {
  const { DomainError } = await import('@/lib/api/route')
  return {
    loadAgentDoc: async (id: string) => {
      const agent = store.agents.get(id)
      if (!agent) throw new DomainError(404, 'Agente rotineiro não encontrado', 'ROUTINE_AGENT_NOT_FOUND')
      return agent
    },
    routineLog: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  }
})
vi.mock('@/features/routine-agents/server/engramind', () => ({ routineAgentTarget: vi.fn(), routineMemoryChannels: vi.fn() }))
vi.mock('@/features/routine-agents/server/secrets', () => ({ loadRoutineSecretVault: vi.fn() }))
// O runner real carrega o turno; aqui só importa que ele recebe o escopo do agente (loadSession real).
vi.mock('@/features/opex-agent/server/runner', async () => {
  const { loadSession } = await import('@/features/opex-agent/server/sessions')
  return {
    sendMessage: async (id: string, input: unknown, _actor: string, scope: unknown) => {
      await loadSession(id, scope as never)
      store.sent.push(input)
      return { id: 'msg' }
    },
    interruptSession: async (id: string, scope: unknown) => void (await loadSession(id, scope as never)),
  }
})
vi.mock('@/features/opex-agent/server/confirmations', () => ({ decideAction: vi.fn() }))

import { createRoutineChatSession, getRoutineChatSession, interruptRoutineChat, listRoutineChatSessions, routineChatStatus, sendRoutineChatMessage } from '@/features/routine-agents/server/chat/service'

const AGENT_A = 'a'.repeat(24)
const AGENT_B = 'b'.repeat(24)
const agent = (id: string, extra: Record<string, unknown> = {}) => ({
  _id: id,
  name: id,
  slug: id,
  status: 'active',
  engine: 'opex',
  provisioning: { status: 'ok' },
  opex: { provider: 'openai', model: 'gpt-x', variant: null, enabledTools: [], enabledMcpServers: [] },
  opencode: {},
  ...extra,
})
const sessions = () => store.sessions as ReturnType<typeof memoryModel>

beforeEach(() => {
  sessions().docs.splice(0)
  store.sent = []
  store.agents = new Map([
    [AGENT_A, agent(AGENT_A)],
    [AGENT_B, agent(AGENT_B)],
  ])
})

describe('conversa com o agente rotineiro: serviço (OPE-160)', () => {
  it('a conversa do agente A não abre, não recebe mensagem nem é interrompida pela URL do agente B', async () => {
    const { session } = await createRoutineChatSession(AGENT_A, undefined, 'local')
    expect(sessions().docs[0]).toMatchObject({ agent: 'routine', routineAgentId: AGENT_A, clientId: null })
    await expect(getRoutineChatSession(AGENT_A, session.id)).resolves.toMatchObject({ session: { id: session.id } })
    await expect(getRoutineChatSession(AGENT_B, session.id)).rejects.toMatchObject({ status: 404, code: 'OPEX_SESSION_NOT_FOUND' })
    await expect(sendRoutineChatMessage(AGENT_B, session.id, { text: 'oi' }, 'local')).rejects.toMatchObject({ status: 404 })
    await expect(interruptRoutineChat(AGENT_B, session.id)).rejects.toMatchObject({ status: 404 })
    expect(store.sent).toEqual([])
    expect(await listRoutineChatSessions(AGENT_B)).toEqual([])
    expect((await listRoutineChatSessions(AGENT_A)).map((item) => item.id)).toEqual([session.id])
  })

  it('agente pausado: criar a conversa recusa com 409 sem gravar a sessão', async () => {
    store.agents.set(AGENT_A, agent(AGENT_A, { status: 'paused' }))
    await expect(createRoutineChatSession(AGENT_A, 'oi', 'local')).rejects.toMatchObject({ status: 409, code: 'ROUTINE_AGENT_PAUSED' })
    expect(sessions().docs).toHaveLength(0)
  })

  it('agente inexistente: 404', async () => {
    await expect(listRoutineChatSessions('c'.repeat(24))).rejects.toMatchObject({ status: 404, code: 'ROUTINE_AGENT_NOT_FOUND' })
  })

  it('status: modelo do agente quando disponível; senão indisponível com o motivo', async () => {
    await expect(routineChatStatus(AGENT_A)).resolves.toMatchObject({ available: true, reason: null, modelLabel: expect.stringContaining('gpt-x') })
    store.agents.set(AGENT_B, agent(AGENT_B, { engine: 'opencode' }))
    await expect(routineChatStatus(AGENT_B)).resolves.toMatchObject({ available: false, modelLabel: null, reason: expect.stringMatching(/só no motor Opex/) })
  })
})
