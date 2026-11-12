import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Turno da conversa com um agente rotineiro (OPE-160): carrega só o que é do agente (modelo atual,
 * ferramentas liberadas, MCPs, skills, memória com o token dele e segredos) e NENHUMA instrução de
 * execução; não é execução (sem `routine_runs`, fila nem ferramentas de controle). Disponibilidade,
 * confirmação pelo switch do agente e a política conferida antes de cada ferramenta.
 */

const h = vi.hoisted(() => ({
  agent: null as unknown as Record<string, unknown>,
  memoryContext: vi.fn(),
  appToolsFor: vi.fn(),
  mcpToolsFor: vi.fn(),
  triggerRoutineRun: vi.fn(),
  mcpClose: vi.fn(async () => undefined),
  needsConfirmation: vi.fn(() => true),
  settings: { disabledTools: [] as string[], confirmationOverrides: {} as Record<string, boolean> },
  secrets: [{ name: 'API_KEY', description: 'Chave da API', allowedHosts: ['api.example.com'] }],
}))

const tool = (name: string, group = 'tasks') => ({ name, group, label: name, risk: 'write', description: name, input: { parse: (value: unknown) => value } })

vi.mock('@/features/routine-agents/server/shared', () => ({
  loadAgentDoc: async () => h.agent,
  routineLog: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))
vi.mock('@/features/routine-agents/server/runs', () => ({ triggerRoutineRun: h.triggerRoutineRun }))
vi.mock('@/features/routine-agents/server/engramind', () => ({
  routineAgentTarget: async () => ({ baseUrl: 'http://engramind', token: 'tk_agent' }),
  routineMemoryChannels: async (agent: { slug: string }) => ({ channels: ['opex', 'agentes/rotineiros/global', `agentes/rotineiros/${agent.slug}`], memoryChannels: [`agentes/rotineiros/${agent.slug}`, 'opex', 'agentes/rotineiros/global'] }),
}))
vi.mock('@/features/engramind/server/memory-context', () => ({ getAgentMemoryContext: h.memoryContext }))
vi.mock('@/features/opex-agent/server/settings', () => ({ loadOpexSettings: async () => ({ settings: h.settings }) }))
vi.mock('@/features/opex-agent/server/tools/registry', () => ({
  needsConfirmation: h.needsConfirmation,
  findOpexTool: (name: string) => (name === 'create_task' ? tool('create_task') : name === 'update_routine_agent' ? tool('update_routine_agent', 'routine-agents') : undefined),
  enabledOpexTools: (disabled: string[]) => [tool('create_task'), tool('http_request', 'http')].filter((item) => !disabled.includes(item.name)),
}))
vi.mock('@/features/routine-agents/server/engines/opex', () => ({ appToolsFor: h.appToolsFor, mcpToolsFor: h.mcpToolsFor }))
vi.mock('@/features/opex-agent/server/skills/turn', () => ({
  routineSkillsForRun: async (selected: string[]) => ({ catalog: [{ name: 'revisar', description: 'Use ao revisar' }], tools: selected.length ? [tool('load_opex_skill', 'opex-skills')] : [], missing: [] }),
}))
vi.mock('@/features/opex-agent/server/turn-history', () => ({ loadSessionHistory: vi.fn(async () => [{ role: 'user', content: 'oi' }]) }))
vi.mock('@/features/opex-agent/server/sessions', () => ({ loadSession: async () => ({ summary: '' }) }))
vi.mock('@/features/routine-agents/server/secrets', () => ({ loadRoutineSecretVault: async () => ({ list: () => h.secrets, value: () => undefined, markUsed: () => undefined }) }))
vi.mock('@/features/engramind/server/client', () => ({ engramindCall: vi.fn() }))
vi.mock('@/lib/audit/record', () => ({ AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR' }, recordAudit: vi.fn(async () => undefined) }))
vi.mock('@/lib/pusher/channels', () => ({ integrationChannel: (name: string) => `private-integration-${name}`, publishToChannels: vi.fn(async () => undefined) }))

import { assertRoutineChatAvailable, assertRoutineChatToolAllowed, prepareRoutineChatTurn, routineChatScope, routineChatTurnModel } from '@/features/routine-agents/server/chat/turn'
import type { RoutineAgentDoc } from '@/features/routine-agents/server/shared'

const baseAgent = () => ({
  _id: 'ag1',
  name: 'Vagas',
  slug: 'vagas',
  objective: 'OBJETIVO SECRETO DA ROTINA',
  instructions: 'INSTRUÇÕES DO DONO',
  status: 'active',
  engine: 'opex',
  provisioning: { status: 'ok', extras: [] },
  engramindToken: { encrypted: true },
  confirmIrreversible: true,
  opex: { provider: 'openai', model: 'gpt-x', variant: null, enabledTools: ['create_task', 'http_request'], enabledMcpServers: ['m1'], enabledSkills: ['revisar'] },
  opencode: {},
  limits: { maxTokens: 10, maxActiveMinutes: 1, concurrency: 1 },
})

const input = (signal = new AbortController().signal) => ({ sessionId: 's1', assistantId: 'a1', scope: routineChatScope('ag1'), actorId: 'local', userText: 'Como você está?', model: { provider: 'openai' as const, model: 'gpt-x', variant: null }, signal })

beforeEach(() => {
  vi.clearAllMocks()
  h.agent = baseAgent()
  h.settings = { disabledTools: [], confirmationOverrides: {} }
  h.memoryContext.mockResolvedValue({ block: '## Memórias\n- Lembre do catálogo', source: 'live', reason: null, counts: { full: 1, titles: 0, overflow: 0 } })
  h.appToolsFor.mockImplementation(async (names: string[]) => names.map((name) => tool(name, name === 'http_request' ? 'http' : 'tasks')))
  h.mcpToolsFor.mockResolvedValue({ tools: [{ ...tool('mcp_gh_search', 'mcp'), mcpServerId: 'm1' }], overrides: {}, notices: [], close: h.mcpClose })
  h.needsConfirmation.mockReturnValue(true)
})

describe('turno da conversa (OPE-160)', () => {
  it('carrega ferramentas, MCPs, skills e memória do agente, sem instrução nem ferramenta de execução', async () => {
    const turn = await prepareRoutineChatTurn(input())
    const names = turn.tools.map((item) => item.name)
    expect(names).toEqual(expect.arrayContaining(['create_task', 'http_request', 'mcp_gh_search', 'remember', 'update_memory', 'list_my_memories', 'load_opex_skill']))
    for (const control of ['finish', 'hibernate', 'wait', 'request_confirmation']) expect(names).not.toContain(control)
    // Memória lida com o token do agente, nos canais assinados.
    expect(h.memoryContext).toHaveBeenCalledWith('rotineiro-vagas', ['opex', 'agentes/rotineiros/global', 'agentes/rotineiros/vagas'], expect.objectContaining({ target: { baseUrl: 'http://engramind', token: 'tk_agent' }, focus: 'Como você está?' }))
    expect(turn.instructions).toContain('- Lembre do catálogo')
    expect(turn.instructions).toContain('revisar')
    expect(turn.instructions).toContain('API_KEY')
    for (const banned of ['OBJETIVO SECRETO', 'INSTRUÇÕES DO DONO', 'Como trabalhar', 'finish', 'agente rotineiro', 'agentes/rotineiros/vagas']) expect(turn.instructions).not.toContain(banned)
    expect(turn.toolContext.secrets?.list()).toEqual(h.secrets)
    expect(turn.timeout).toMatchObject({ ms: 30 * 60_000 })
    expect(h.triggerRoutineRun).not.toHaveBeenCalled()
    await turn.close()
    expect(h.mcpClose).toHaveBeenCalled()
  })

  it('confirmação segue o switch do agente; internas nunca confirmam', async () => {
    const turn = await prepareRoutineChatTurn(input())
    const byName = (name: string) => turn.tools.find((item) => item.name === name)!
    expect(turn.hooks?.shouldConfirm?.(byName('create_task'))).toBe(true)
    expect(turn.hooks?.shouldConfirm?.(byName('remember'))).toBe(false)
    h.agent = { ...baseAgent(), confirmIrreversible: false }
    const free = await prepareRoutineChatTurn(input())
    expect(free.hooks?.shouldConfirm?.(free.tools.find((item) => item.name === 'create_task')!)).toBe(false)
  })

  it('sem a Chamada HTTP, os segredos não entram no prompt', async () => {
    h.agent = { ...baseAgent(), opex: { ...baseAgent().opex, enabledTools: ['create_task'] } }
    const turn = await prepareRoutineChatTurn(input())
    expect(turn.instructions).not.toContain('API_KEY')
  })

  it('Engramind fora do ar sem cache: erro acionável; com cache: aviso no chat', async () => {
    h.memoryContext.mockResolvedValueOnce({ block: '', source: 'none', reason: 'timeout', counts: { full: 0, titles: 0, overflow: 0 } })
    await expect(prepareRoutineChatTurn(input())).rejects.toThrow(/Engramind indisponível \(timeout\)/)
    h.memoryContext.mockResolvedValueOnce({ block: 'x', source: 'cache', reason: null, counts: { full: 0, titles: 0, overflow: 0 } })
    const turn = await prepareRoutineChatTurn(input())
    expect(turn.notices.join(' ')).toMatch(/cache/)
  })

  it('a política é conferida antes de cada ferramenta (falha fechada)', async () => {
    const turn = await prepareRoutineChatTurn(input())
    const createTask = turn.tools.find((item) => item.name === 'create_task')!
    await expect(turn.hooks!.authorize!(createTask)).resolves.toBeUndefined()
    h.agent = { ...baseAgent(), opex: { ...baseAgent().opex, enabledTools: [] } }
    await expect(turn.hooks!.authorize!(createTask)).rejects.toThrow(/não está mais liberada/)
    // Internas não dependem da lista do agente.
    await expect(turn.hooks!.authorize!(turn.tools.find((item) => item.name === 'remember')!)).resolves.toBeUndefined()
  })
})

describe('disponibilidade e política (OPE-160)', () => {
  const doc = (extra: Record<string, unknown>) => ({ ...baseAgent(), ...extra }) as unknown as RoutineAgentDoc

  it('devolve o modelo atual do agente', async () => {
    await expect(routineChatTurnModel(routineChatScope('ag1'))).resolves.toEqual({ provider: 'openai', model: 'gpt-x', variant: null })
  })

  it('recusa pausado, OpenCode, sem provisionamento e provedor inválido', () => {
    expect(() => assertRoutineChatAvailable(doc({ status: 'paused' }))).toThrow(expect.objectContaining({ code: 'ROUTINE_AGENT_PAUSED', status: 409 }))
    expect(() => assertRoutineChatAvailable(doc({ engine: 'opencode' }))).toThrow(expect.objectContaining({ code: 'ROUTINE_CHAT_ENGINE_UNSUPPORTED' }))
    expect(() => assertRoutineChatAvailable(doc({ provisioning: { status: 'error' } }))).toThrow(expect.objectContaining({ code: 'ROUTINE_AGENT_NOT_PROVISIONED' }))
    expect(() => assertRoutineChatAvailable(doc({ opex: { ...baseAgent().opex, provider: 'opencode' } }))).toThrow(expect.objectContaining({ code: 'ROUTINE_ENGINE_PROVIDER_INVALID' }))
  })

  it('ferramenta desligada no Agente Opex, de grupo proibido ou MCP não liberado: recusa', async () => {
    await expect(assertRoutineChatToolAllowed('ag1', 'create_task')).resolves.toBeUndefined()
    h.settings = { disabledTools: ['create_task'], confirmationOverrides: {} }
    await expect(assertRoutineChatToolAllowed('ag1', 'create_task')).rejects.toThrow(/desligada no Agente Opex/)
    h.agent = { ...baseAgent(), opex: { ...baseAgent().opex, enabledTools: ['update_routine_agent'] } }
    await expect(assertRoutineChatToolAllowed('ag1', 'update_routine_agent')).rejects.toThrow(/não pode ser usada/)
    await expect(assertRoutineChatToolAllowed('ag1', 'mcp_x', 'm2')).rejects.toThrow(/MCP/)
    await expect(assertRoutineChatToolAllowed('ag1', 'mcp_gh_search', 'm1')).resolves.toBeUndefined()
  })
})
