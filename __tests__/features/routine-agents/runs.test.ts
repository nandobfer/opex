import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeCollection, fakeId, type FakeCollection } from '../../helpers/fake-collection'

/**
 * Execuções dos agentes rotineiros (OPE-130): disparo, fila FIFO com o limite de simultâneas,
 * hibernação e retomada pelo tick, confirmação (uma resposta só), cancelamento e os casos de borda
 * do agendador (turno perdido, expiração, agendado descartado com o agente pausado).
 */

const holder = vi.hoisted(() => ({
  agents: null as unknown as FakeCollection,
  runs: null as unknown as FakeCollection,
  steps: null as unknown as FakeCollection,
  engine: null as unknown as (input: { internalTools: { name: string; execute: (input: unknown, ctx: unknown) => Promise<unknown> }[]; activation: { controller: AbortController } }) => Promise<{ error: string | null; text: string }>,
  audit: [] as { acao: string; depois?: Record<string, unknown> }[],
  catalog: new Map<string, { name: string; label: string; group: string; input: { parse: (raw: unknown) => unknown }; execute: (input: unknown) => Promise<unknown> }>(),
  executed: [] as { name: string; input: unknown }[],
  startProvisioning: vi.fn(async () => undefined),
  events: [] as { event: string; payload: Record<string, unknown> }[],
}))

vi.mock('@/lib/db', () => ({
  dbConnect: async () => undefined,
  recordAudit: async (input: { acao: string; depois?: Record<string, unknown> }) => void holder.audit.push(input),
  AcaoAuditoria: { EXECUTAR: 'EXECUTAR', ABORTAR: 'ABORTAR', APROVAR: 'APROVAR', DEVOLVER: 'DEVOLVER', CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR' },
}))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: async (event: string, payload: Record<string, unknown>) => void holder.events.push({ event, payload }) }))
vi.mock('@/lib/ai/consumption', () => ({ recordAiConsumption: async () => undefined }))
vi.mock('@/lib/db/models/RoutineAgent', () => ({
  get RoutineAgent() {
    return holder.agents
  },
  get RoutineRun() {
    return holder.runs
  },
  get RoutineRunStep() {
    return holder.steps
  },
}))
vi.mock('@/features/routine-agents/server/engramind', () => ({
  baseRoutineChannels: (slug: string) => ['opex', 'agentes/rotineiros/global', `agentes/rotineiros/${slug}`],
  routineAgentTarget: async () => ({ baseUrl: 'http://engramind', token: 'agent-token' }),
}))
vi.mock('@/features/engramind/server/memory-context', () => ({ getAgentMemoryContext: async () => ({ block: '', source: 'live', cachedAt: null, counts: { full: 0, titles: 0, overflow: 0 }, reason: null }) }))
vi.mock('@/features/opex-agent/server/tools/registry', () => ({ findOpexTool: (name: string) => holder.catalog.get(name) }))
vi.mock('@/features/opex-agent/server/mcp/tools', () => ({ resolveMcpTool: async () => null }))
vi.mock('@/features/routine-agents/server/provisioning', () => ({ startProvisioning: (...args: unknown[]) => holder.startProvisioning(...(args as [])) }))
vi.mock('@/features/routine-agents/server/engines/opex', () => ({ runOpexEngine: (input: Parameters<typeof holder.engine>[0]) => holder.engine(input) }))

import { triggerRoutineRun } from '@/features/routine-agents/server/runs'
import { cancelRoutineRun, resolveRoutineAction } from '@/features/routine-agents/server/run-actions'
import { LOST_TURN_MESSAGE, runDueRoutineAgents } from '@/features/routine-agents/server/tick'
import { resetActivationsForTests } from '@/features/routine-agents/server/hub'
import { EMPTY_ROUTINE_LIMITS } from '@/features/routine-agents/schemas'
import { ROUTINE_STOP_GRACE_MS, ROUTINE_TURN_TIMEOUT_MS, TURN_TIMEOUT_MESSAGE } from '@/features/routine-agents/limits'
import { inFlight, PROVISIONING_INTERRUPTED_MESSAGE } from '@/features/routine-agents/server/provisioning-registry'
import { reprovisionRoutineAgent } from '@/features/routine-agents/server/service'

const ctx = { sessionId: '', actorId: 'local' }
const call = (input: Parameters<typeof holder.engine>[0], name: string, args: unknown) => input.internalTools.find((tool) => tool.name === name)!.execute(args, ctx)
const flush = async () => {
  for (let i = 0; i < 30; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

function seedAgent(overrides: Record<string, unknown> = {}) {
  return holder.agents.insert({
    name: 'Vagas',
    slug: 'vagas',
    objective: 'Candidatar-se',
    instructions: '',
    engine: 'opex',
    opex: { provider: 'anthropic', model: 'claude', variant: null, enabledTools: [], enabledMcpServers: [] },
    opencode: { model: '', variant: null, agent: null, enabledMcps: [] },
    confirmIrreversible: true,
    limits: EMPTY_ROUTINE_LIMITS,
    triggers: [],
    status: 'active',
    provisioning: { status: 'ok', error: null, at: null, steps: {}, channels: [], extras: [], warnings: [] },
    engramindToken: null,
    runSeq: 0,
    ...overrides,
  })
}
const run = (id: string) => holder.runs.docs.find((doc) => String(doc._id) === id)!

beforeEach(() => {
  holder.agents = createFakeCollection()
  holder.runs = createFakeCollection(() => ({ activeMs: 0, waitingMs: 0, liveWaitMs: 0, tokens: 0, costUsd: null, costPartial: false, warnings: [], messages: null, resumeNote: null, hibernation: null, pendingAction: null, parkedAt: null, startedAt: null, finishedAt: null, opencodeSessionId: null }))
  holder.steps = createFakeCollection()
  holder.audit = []
  holder.events = []
  holder.engine = async (input) => {
    await call(input, 'finish', { report: 'Feito' })
    return { error: null, text: '' }
  }
  resetActivationsForTests()
  holder.executed = []
  holder.catalog = new Map(
    [
      { name: 'delete_task', label: 'Excluir tarefa', group: 'tasks' },
      { name: 'update_routine_agent', label: 'Editar agente rotineiro', group: 'routine-agents' },
    ].map((tool) => [tool.name, { ...tool, input: { parse: (raw: unknown) => raw }, execute: async (input: unknown) => (holder.executed.push({ name: tool.name, input }), { ok: true }) }]),
  )
  holder.startProvisioning.mockClear()
  inFlight.clear()
  process.env.INTEGRATIONS_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64')
})

describe('disparo e fila', () => {
  it('agente pausado ou sem provisionamento não dispara', async () => {
    const paused = seedAgent({ status: 'paused' })
    await expect(triggerRoutineRun(String(paused._id), { origin: 'manual' }, 'local')).rejects.toMatchObject({ status: 409, code: 'ROUTINE_AGENT_PAUSED' })
    const broken = seedAgent({ slug: 'b', provisioning: { status: 'error' } })
    await expect(triggerRoutineRun(String(broken._id), { origin: 'manual' }, 'local')).rejects.toMatchObject({ status: 409, code: 'ROUTINE_AGENT_NOT_PROVISIONED' })
    expect(holder.runs.docs).toHaveLength(0)
  })

  it('com 1 vaga, a segunda fica Na fila e anda quando a primeira conclui (FIFO), com toast de fim', async () => {
    const agent = seedAgent({ limits: { ...EMPTY_ROUTINE_LIMITS, concurrency: 1 } })
    const releases: (() => void)[] = []
    holder.engine = async (input) => {
      await new Promise<void>((resolve) => releases.push(resolve))
      await call(input, 'finish', { report: 'Feito' })
      return { error: null, text: '' }
    }
    const first = await triggerRoutineRun(String(agent._id), { origin: 'manual', request: 'primeira' }, 'local')
    const second = await triggerRoutineRun(String(agent._id), { origin: 'manual', request: 'segunda' }, 'local')
    expect(first.status).toBe('running')
    expect(second.status).toBe('queued')
    await flush()
    releases.shift()!()
    await flush()
    expect(run(first.runId)).toMatchObject({ status: 'completed', report: 'Feito' })
    expect(run(second.runId).status).toBe('running')
    expect(holder.events).toContainEqual({ event: 'routine-run-attention', payload: expect.objectContaining({ id: first.runId, kind: 'finished', status: 'completed' }) })
    releases.shift()!()
    await flush()
    expect(run(second.runId).status).toBe('completed')
  })
})

describe('hibernação e confirmação', () => {
  it('hibernada não ocupa vaga e o tick retoma na hora marcada, na mesma execução, com o motivo', async () => {
    const agent = seedAgent()
    let turn = 0
    const messages: string[] = []
    holder.engine = async (input) => {
      messages.push((input as unknown as { message: string }).message)
      if (++turn === 1) await call(input, 'hibernate', { minutes: 5, reason: 'a vaga abrir' })
      else await call(input, 'finish', { report: 'Candidatura feita' })
      return { error: null, text: '' }
    }
    const { runId } = await triggerRoutineRun(String(agent._id), { origin: 'manual' }, 'local')
    await flush()
    expect(run(runId).status).toBe('hibernating')
    const at = (run(runId).hibernation as { at: Date }).at
    await runDueRoutineAgents(new Date(at.getTime() - 1_000))
    expect(run(runId).status).toBe('hibernating')
    await runDueRoutineAgents(new Date(at.getTime() + 1_000))
    await flush()
    expect(run(runId)).toMatchObject({ status: 'completed', report: 'Candidatura feita' })
    expect(messages[1]).toContain('a vaga abrir')
  })

  it('confirmar retoma com a ação liberada; a segunda resposta recebe 409', async () => {
    const agent = seedAgent()
    const notes: string[] = []
    holder.engine = async (input) => {
      const message = (input as unknown as { message: string }).message
      notes.push(message)
      if (notes.length === 1) await call(input, 'request_confirmation', { summary: 'Enviar candidatura à vaga 42' })
      else await call(input, 'finish', { report: 'Enviada' })
      return { error: null, text: '' }
    }
    const { runId } = await triggerRoutineRun(String(agent._id), { origin: 'manual' }, 'local')
    await flush()
    expect(run(runId).status).toBe('awaiting_confirmation')
    expect(holder.events).toContainEqual({ event: 'routine-run-attention', payload: expect.objectContaining({ id: runId, kind: 'confirmation' }) })
    await resolveRoutineAction(runId, 'confirmed', 'local')
    await expect(resolveRoutineAction(runId, 'rejected', 'local')).rejects.toMatchObject({ status: 409, code: 'ROUTINE_ACTION_ALREADY_RESOLVED' })
    await flush()
    expect(run(runId).status).toBe('completed')
    expect(notes[1]).toContain('Confirmado pelo dono')
    expect(holder.audit.map((item) => item.acao)).toContain('APROVAR')
  })

  it('recusar retoma com a recusa', async () => {
    const agent = seedAgent()
    const notes: string[] = []
    holder.engine = async (input) => {
      notes.push((input as unknown as { message: string }).message)
      if (notes.length === 1) await call(input, 'request_confirmation', { summary: 'Pagar a taxa' })
      else await call(input, 'finish', { report: 'Segui sem pagar' })
      return { error: null, text: '' }
    }
    const { runId } = await triggerRoutineRun(String(agent._id), { origin: 'manual' }, 'local')
    await flush()
    await resolveRoutineAction(runId, 'rejected', 'local')
    await flush()
    expect(notes[1]).toContain('Recusado pelo dono')
    expect(run(runId).status).toBe('completed')
  })

  it('cancelar uma hibernada encerra como Cancelada', async () => {
    const agent = seedAgent()
    holder.engine = async (input) => {
      await call(input, 'hibernate', { minutes: 30, reason: 'x' })
      return { error: null, text: '' }
    }
    const { runId } = await triggerRoutineRun(String(agent._id), { origin: 'manual' }, 'local')
    await flush()
    await cancelRoutineRun(runId, 'local')
    expect(run(runId).status).toBe('canceled')
    await expect(cancelRoutineRun(runId, 'local')).rejects.toMatchObject({ code: 'ROUTINE_RUN_FINISHED' })
  })
})

describe('tick do agendador', () => {
  it('Executando sem turno vivo (reinício) vira Erro "O turno da execução foi perdido"', async () => {
    const agent = seedAgent()
    const lost = holder.runs.insert({ agentId: agent._id, seq: 1, origin: 'manual', status: 'running', snapshot: { engine: 'opex', limits: EMPTY_ROUTINE_LIMITS }, queuedAt: new Date(), activationStartedAt: new Date(Date.now() - 120_000) })
    await runDueRoutineAgents(new Date())
    expect(run(String(lost._id))).toMatchObject({ status: 'error', error: LOST_TURN_MESSAGE })
  })

  it('hibernada além do tempo total de espera expira', async () => {
    const agent = seedAgent()
    const parked = holder.runs.insert({
      agentId: agent._id,
      seq: 1,
      origin: 'manual',
      status: 'hibernating',
      snapshot: { engine: 'opex', limits: { ...EMPTY_ROUTINE_LIMITS, maxWaitingMinutes: 10 } },
      queuedAt: new Date(),
      parkedAt: new Date(Date.now() - 11 * 60_000),
      hibernation: { at: new Date(Date.now() + 60_000), reason: 'x' },
    })
    await runDueRoutineAgents(new Date())
    expect(run(String(parked._id)).status).toBe('expired')
  })

  it('agendado vencido dispara uma vez; com o agente pausado é descartado sem acumular', async () => {
    const trigger = { id: 't1', enabled: true, kind: 'interval', every: 1, unit: 'hours' }
    const now = new Date('2026-11-05T10:00:00Z')
    const active = seedAgent({ triggers: [{ trigger, nextAt: new Date('2026-11-05T05:00:00Z'), lastFiredAt: null }] })
    const paused = seedAgent({ slug: 'p', status: 'paused', triggers: [{ trigger, nextAt: new Date('2026-11-05T05:00:00Z'), lastFiredAt: null }] })
    await runDueRoutineAgents(now)
    await flush()
    const runsOf = (agentId: unknown) => holder.runs.docs.filter((doc) => String(doc.agentId) === String(agentId))
    expect(runsOf(active._id)).toHaveLength(1)
    expect(runsOf(active._id)[0]).toMatchObject({ origin: 'schedule', delayMs: 5 * 3_600_000 })
    expect(runsOf(paused._id)).toHaveLength(0)
    const pausedState = holder.agents.docs.find((doc) => doc._id === paused._id)!.triggers as { nextAt: Date }[]
    expect(pausedState[0]!.nextAt.toISOString()).toBe('2026-11-05T11:00:00.000Z')
    // O mesmo tick de novo não dispara a mesma janela.
    await runDueRoutineAgents(now)
    expect(runsOf(active._id)).toHaveLength(1)
  })
})

describe('confirmação de ferramenta interceptada (motor Opex)', () => {
  const intercepted = (toolName: string, notes: string[]) => async (input: Parameters<typeof holder.engine>[0]) => {
    notes.push((input as unknown as { message: string }).message)
    if (notes.length === 1) {
      ;(input.activation as unknown as { outcome: unknown }).outcome = {
        kind: 'confirmation',
        action: { summary: 'Excluir a tarefa t1', kind: 'tool', toolName, toolLabel: toolName, input: JSON.stringify({ id: 't1' }), displayInput: '{"id":"t1"}' },
      }
    } else await call(input, 'finish', { report: 'Feito' })
    return { error: null, text: '' }
  }

  it('confirmar executa a ferramenta com o input guardado (cifrado) e retoma com o resultado', async () => {
    const notes: string[] = []
    holder.engine = intercepted('delete_task', notes)
    const { runId } = await triggerRoutineRun(String(seedAgent()._id), { origin: 'manual' }, 'local')
    await flush()
    expect(run(runId).status).toBe('awaiting_confirmation')
    expect(JSON.stringify(run(runId).pendingAction)).not.toContain('"id":"t1"}"')
    expect(holder.executed).toEqual([])
    await resolveRoutineAction(runId, 'confirmed', 'local')
    await flush()
    expect(holder.executed).toEqual([{ name: 'delete_task', input: { id: 't1' } }])
    expect(notes[1]).toContain('Resultado de "Excluir tarefa"')
    expect(run(runId).status).toBe('completed')
  })

  it('ferramenta que sumiu do catálogo retoma com o aviso, sem executar', async () => {
    const notes: string[] = []
    holder.engine = intercepted('removida', notes)
    const { runId } = await triggerRoutineRun(String(seedAgent()._id), { origin: 'manual' }, 'local')
    await flush()
    await resolveRoutineAction(runId, 'confirmed', 'local')
    await flush()
    expect(holder.executed).toEqual([])
    expect(notes[1]).toContain('não existe mais: a ação não foi executada')
  })

  it('ferramenta do grupo routine-agents não é executada nem confirmada', async () => {
    const notes: string[] = []
    holder.engine = intercepted('update_routine_agent', notes)
    const { runId } = await triggerRoutineRun(String(seedAgent()._id), { origin: 'manual' }, 'local')
    await flush()
    await resolveRoutineAction(runId, 'confirmed', 'local')
    await flush()
    expect(holder.executed).toEqual([])
    expect(notes[1]).toContain('não pode ser usada por agentes rotineiros')
  })
})

describe('teto técnico do turno', () => {
  it('sem "Tempo máximo ativo", um motor que nunca responde vira Erro no teto, libera a vaga e a fila anda', async () => {
    vi.useFakeTimers()
    try {
      const agent = seedAgent({ limits: { ...EMPTY_ROUTINE_LIMITS, concurrency: 1 } })
      let turns = 0
      holder.engine = async (input) => {
        if (++turns === 1) return new Promise(() => undefined) // pendurado: ignora até o sinal de interrupção
        await call(input, 'finish', { report: 'Feito' })
        return { error: null, text: '' }
      }
      const first = await triggerRoutineRun(String(agent._id), { origin: 'manual' }, 'local')
      const second = await triggerRoutineRun(String(agent._id), { origin: 'manual' }, 'local')
      expect(second.status).toBe('queued')
      await vi.advanceTimersByTimeAsync(ROUTINE_TURN_TIMEOUT_MS - 1_000)
      expect(run(first.runId).status).toBe('running')
      await vi.advanceTimersByTimeAsync(1_000 + ROUTINE_STOP_GRACE_MS + 1_000)
      expect(run(first.runId)).toMatchObject({ status: 'error', error: TURN_TIMEOUT_MESSAGE })
      await vi.advanceTimersByTimeAsync(100)
      expect(run(second.runId).status).toBe('completed')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('provisionamento interrompido por reinício', () => {
  const stale = (overrides: Record<string, unknown> = {}) =>
    seedAgent({ slug: `s${Math.random()}`, provisioning: { status: 'running', error: null, at: new Date(Date.now() - 10 * 60_000), steps: {}, channels: [], extras: [], warnings: [] }, ...overrides })
  const agentDoc = (id: unknown) => holder.agents.docs.find((doc) => doc._id === id)! as { provisioning: { status: string; error: string | null } }

  it('o tick marca "com erro" o provisionamento sem processo vivo; recente ou vivo fica como está', async () => {
    const old = stale()
    const recent = stale({ provisioning: { status: 'running', error: null, at: new Date(), steps: {}, channels: [], extras: [], warnings: [] } })
    const alive = stale()
    inFlight.set(String(alive._id), new Promise(() => undefined))
    await runDueRoutineAgents(new Date())
    expect(agentDoc(old._id).provisioning).toMatchObject({ status: 'error', error: PROVISIONING_INTERRUPTED_MESSAGE })
    expect(agentDoc(recent._id).provisioning.status).toBe('running')
    expect(agentDoc(alive._id).provisioning.status).toBe('running')
  })

  it('"Tentar de novo" aceita um "running" obsoleto e recusa com 409 quando o provisionamento está vivo', async () => {
    Object.assign(holder.runs, { aggregate: async () => [] })
    const old = stale()
    await reprovisionRoutineAgent(String(old._id), 'retry', 'local')
    expect(holder.startProvisioning).toHaveBeenCalledTimes(1)
    const alive = stale()
    inFlight.set(String(alive._id), new Promise(() => undefined))
    await expect(reprovisionRoutineAgent(String(alive._id), 'retry', 'local')).rejects.toMatchObject({ status: 409, code: 'ROUTINE_AGENT_PROVISIONING' })
    expect(holder.startProvisioning).toHaveBeenCalledTimes(1)
  })
})

void fakeId
