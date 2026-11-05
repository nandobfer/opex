import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Ferramentas do Agente Opex para os agentes rotineiros (OPE-130): catálogo, risco e serviços reais. */

const mocks = vi.hoisted(() => ({
  service: { listRoutineAgents: vi.fn(async () => []), getRoutineAgent: vi.fn(), createRoutineAgent: vi.fn(async () => ({ id: 'x' })), updateRoutineAgent: vi.fn(async () => ({ id: 'x' })), setRoutineAgentStatus: vi.fn(async () => ({})), reprovisionRoutineAgent: vi.fn(async () => ({})) },
  runs: { triggerRoutineRun: vi.fn(async () => ({ runId: 'r', status: 'running' })) },
  actions: { cancelRoutineRun: vi.fn(async () => ({ status: 'canceled' })), resolveRoutineAction: vi.fn(async () => ({ status: 'queued' })) },
  entries: { addRoutineEntry: vi.fn(async () => ({ id: 'e' })) },
}))
vi.mock('@/features/routine-agents/server/service', () => mocks.service)
vi.mock('@/features/routine-agents/server/runs', () => mocks.runs)
vi.mock('@/features/routine-agents/server/run-actions', () => mocks.actions)
vi.mock('@/features/routine-agents/server/entries', () => mocks.entries)

import { routineAgentTools } from '@/features/opex-agent/server/tools/routine-agents'
import { toAgentDto } from '@/features/routine-agents/server/shared'
import { EMPTY_ROUTINE_LIMITS } from '@/features/routine-agents/schemas'
import { mcpOwnerToolDecision } from '@/features/integrations/api-tokens/scopes'
import { needsConfirmation } from '@/features/opex-agent/server/tools/registry'

const tool = (name: string) => routineAgentTools.find((item) => item.name === name)!
const ctx = { sessionId: 's', actorId: 'local' }
const ID = 'a'.repeat(24)

beforeEach(() => vi.clearAllMocks())

describe('ferramentas dos agentes rotineiros', () => {
  it('existem as 13 ferramentas; arquivar e cancelar são destrutivas', () => {
    expect(routineAgentTools.map((item) => item.name).sort()).toEqual(
      ['add_routine_entry', 'archive_routine_agent', 'cancel_routine_run', 'confirm_routine_action', 'create_routine_agent', 'get_routine_agent', 'list_routine_agents', 'list_routine_runs', 'pause_routine_agent', 'reject_routine_action', 'reprovision_routine_agent', 'run_routine_agent', 'update_routine_agent'].sort(),
    )
    expect(routineAgentTools.filter((item) => item.risk === 'destructive').map((item) => item.name).sort()).toEqual(['archive_routine_agent', 'cancel_routine_run'])
    expect(new Set(routineAgentTools.map((item) => item.group))).toEqual(new Set(['routine-agents']))
  })

  it('chamam os serviços reais (criar com os padrões, executar com a origem do Agente Opex, confirmar/recusar)', async () => {
    await tool('create_routine_agent').execute(tool('create_routine_agent').input.parse({ name: 'Vagas', objective: 'Candidatar', opex: { provider: 'anthropic', model: 'claude' } }), ctx)
    expect(mocks.service.createRoutineAgent).toHaveBeenCalledWith(expect.objectContaining({ name: 'Vagas', engine: 'opex', confirmIrreversible: true, opex: expect.objectContaining({ provider: 'anthropic', model: 'claude', enabledTools: [] }) }), 'local')
    await tool('run_routine_agent').execute({ id: ID, solicitacao: 'hoje' }, ctx)
    expect(mocks.runs.triggerRoutineRun).toHaveBeenCalledWith(ID, { origin: 'opex-agent', request: 'hoje' }, 'local')
    await tool('confirm_routine_action').execute({ runId: ID }, ctx)
    await tool('reject_routine_action').execute({ runId: ID, observacao: 'não' }, ctx)
    expect(mocks.actions.resolveRoutineAction.mock.calls).toEqual([
      [ID, 'confirmed', 'local', undefined],
      [ID, 'rejected', 'local', 'não'],
    ])
    await tool('archive_routine_agent').execute(tool('archive_routine_agent').input.parse({ id: ID }), ctx)
    expect(mocks.service.setRoutineAgentStatus).toHaveBeenCalledWith(ID, 'archive', 'local')
    await tool('add_routine_entry').execute(tool('add_routine_entry').input.parse({ id: ID, texto: 'Sem vagas presenciais' }), ctx)
    expect(mocks.entries.addRoutineEntry).toHaveBeenCalledWith(ID, { text: 'Sem vagas presenciais', target: 'agent' }, 'local')
  })

  it('confirmar ação do rotineiro (que executa a ação, às vezes destrutiva) pede confirmação no chat e exige o escopo destrutivo por token', () => {
    const confirm = tool('confirm_routine_action')
    expect(needsConfirmation(confirm)).toBe(true)
    expect(mcpOwnerToolDecision(['mcp:owner', 'mcp:owner:tool:*'], confirm)).toEqual({ ok: false, reason: 'destructive' })
    expect(mcpOwnerToolDecision(['mcp:owner', 'mcp:owner:group:routine-agents'], confirm)).toEqual({ ok: false, reason: 'destructive' })
    expect(mcpOwnerToolDecision(['mcp:owner', 'mcp:owner:tool:*', 'mcp:owner:destructive'], confirm)).toEqual({ ok: true })
    expect(needsConfirmation(tool('reject_routine_action'))).toBe(false)
  })

  it('critério aprovado (OPE-130, D6/D7): Chamada HTTP é escrita sem confirmação por padrão, ajustável pelo dono, e fora dos tokens', async () => {
    const { httpTools } = await import('@/features/opex-agent/server/tools/http')
    const http = httpTools[0]!
    expect(http).toMatchObject({ name: 'http_request', group: 'http', risk: 'write' })
    expect(http.confirmByDefault).toBeUndefined()
    expect(needsConfirmation(http)).toBe(false)
    expect(needsConfirmation(http, { http_request: true })).toBe(true)
    expect(mcpOwnerToolDecision(['mcp:owner', 'mcp:owner:tool:*', 'mcp:owner:destructive'], http)).toEqual({ ok: false, reason: 'not_grantable' })
  })

  it('criar sem modelo é recusado pela validação do contrato', async () => {
    await expect(tool('create_routine_agent').execute(tool('create_routine_agent').input.parse({ name: 'Vagas', objective: 'Candidatar' }), ctx)).rejects.toThrow()
    expect(mocks.service.createRoutineAgent).not.toHaveBeenCalled()
  })

  it('o DTO do agente nunca leva o token do Engramind', () => {
    const dto = toAgentDto({
      _id: ID as never,
      name: 'Vagas',
      nameKey: 'vagas',
      slug: 'vagas',
      objective: 'x',
      instructions: '',
      engine: 'opex',
      opex: { provider: 'anthropic', model: 'claude', variant: null, enabledTools: [], enabledMcpServers: [] },
      opencode: { model: '', variant: null, agent: null, enabledMcps: [] },
      confirmIrreversible: true,
      limits: EMPTY_ROUTINE_LIMITS,
      triggers: [],
      status: 'active',
      provisioning: { status: 'ok', error: null, at: null, steps: { agent: true, token: true, channels: true, extras: true, workdir: true }, channels: [], extras: [], warnings: [] },
      engramindToken: { tokenId: 'tok', prefix: 'eng.tok', secret: { v: 1, iv: 'a', tag: 'b', data: 'SEGREDO' } as never, issuedAt: new Date() },
      workdir: null,
      runSeq: 0,
      lastRunAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    expect(JSON.stringify(dto)).not.toMatch(/SEGREDO|eng\.tok|tokenId/)
    expect(dto).toMatchObject({ engramindAgent: 'opex/rotineiro-vagas', channel: 'agentes/rotineiros/vagas' })
  })
})
