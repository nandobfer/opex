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
  secrets: null as unknown as FakeCollection,
  engine: null as unknown as (input: { internalTools: { name: string; execute: (input: unknown, ctx: unknown) => Promise<unknown> }[]; activation: { controller: AbortController } }) => Promise<{ error: string | null; text: string }>,
  audit: [] as { acao: string; depois?: Record<string, unknown> }[],
  archivedChannels: [] as string[],
  catalog: new Map<string, { name: string; label: string; group: string; input: { parse: (raw: unknown) => unknown }; execute: (input: unknown, ctx?: unknown) => Promise<unknown> }>(),
  executed: [] as { name: string; input: unknown }[],
  startProvisioning: vi.fn(async () => undefined),
  events: [] as { event: string; payload: Record<string, unknown> }[],
  opexSettings: { disabledTools: [] as string[], confirmationOverrides: {} as Record<string, boolean> },
  opexSkills: [] as { name: string; description: string }[],
}))
vi.mock('@/features/opex-agent/server/skills/service', () => ({
  existingSkillNames: async (names: string[]) => new Set(names.filter((name) => holder.opexSkills.some((skill) => skill.name === name))),
}))
vi.mock('@/features/opex-agent/server/skills/turn', () => ({
  routineSkillsForRun: async (selected: string[]) => {
    const catalog = holder.opexSkills.filter((skill) => selected.includes(skill.name))
    const tools = catalog.length ? [{ name: 'load_opex_skill', label: 'Carregar skill', group: 'opex-skills', input: { parse: (raw: unknown) => raw }, execute: async () => ({ available: true }) }] : []
    return { catalog, tools, missing: selected.filter((name) => !catalog.some((skill) => skill.name === name)) }
  },
}))
vi.mock('@/features/opex-agent/server/settings', () => ({ loadOpexSettings: async () => ({ settings: holder.opexSettings }) }))

vi.mock('@/lib/db', () => ({
  dbConnect: async () => undefined,
  recordAudit: async (input: { acao: string; depois?: Record<string, unknown> }) => void holder.audit.push(input),
  AcaoAuditoria: { EXECUTAR: 'EXECUTAR', ABORTAR: 'ABORTAR', APROVAR: 'APROVAR', DEVOLVER: 'DEVOLVER', CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR' },
}))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: async (event: string, payload: Record<string, unknown>) => void holder.events.push({ event, payload }) }))
const consumption = vi.hoisted(() => ({ record: vi.fn(async (...args: unknown[]) => void args) }))
vi.mock('@/lib/ai/consumption', () => ({ recordAiConsumption: consumption.record }))
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
  get RoutineAgentSecret() {
    return holder.secrets
  },
}))
vi.mock('@/features/routine-agents/server/engramind', () => ({
  baseRoutineChannels: (slug: string) => ['opex', 'agentes/rotineiros/global', `agentes/rotineiros/${slug}`],
  routineAgentTarget: async () => ({ baseUrl: 'http://engramind', token: 'agent-token' }),
  activeRoutineChannels: async (channels: string[]) => ({ active: channels.filter((channel) => !holder.archivedChannels.includes(channel)), archived: channels.filter((channel) => holder.archivedChannels.includes(channel)) }),
}))
vi.mock('@/features/engramind/server/memory-context', () => ({ getAgentMemoryContext: async () => ({ block: '', source: 'live', cachedAt: null, counts: { full: 0, titles: 0, overflow: 0 }, reason: null }) }))
vi.mock('@/features/opex-agent/server/tools/registry', () => ({ findOpexTool: (name: string) => holder.catalog.get(name) }))
vi.mock('@/features/opex-agent/server/mcp/tools', () => ({ resolveMcpTool: async () => null }))
vi.mock('@/features/routine-agents/server/provisioning', () => ({ startProvisioning: (...args: unknown[]) => holder.startProvisioning(...(args as [])) }))
vi.mock('@/features/routine-agents/server/engines/opex', () => ({ runOpexEngine: (input: Parameters<typeof holder.engine>[0]) => holder.engine(input) }))
vi.mock('@/features/routine-agents/server/engines/opencode', async (importOriginal) => ({ ...(await importOriginal<object>()), runOpencodeEngine: (input: Parameters<typeof holder.engine>[0]) => holder.engine(input) }))

import { INTERRUPTED_RESUME_NOTE, triggerRoutineRun } from '@/features/routine-agents/server/runs'
import { cancelRoutineRun, resolveRoutineAction } from '@/features/routine-agents/server/run-actions'
import { LOST_TURN_MESSAGE, runDueRoutineAgents } from '@/features/routine-agents/server/tick'
import { resetActivationsForTests } from '@/features/routine-agents/server/hub'
import { EMPTY_ROUTINE_LIMITS } from '@/features/routine-agents/schemas'
import { ROUTINE_STOP_GRACE_MS, ROUTINE_TURN_TIMEOUT_MS, TURN_TIMEOUT_MESSAGE } from '@/features/routine-agents/limits'
import { inFlight, PROVISIONING_INTERRUPTED_MESSAGE } from '@/features/routine-agents/server/provisioning-registry'
import { createRoutineAgent, reprovisionRoutineAgent, updateRoutineAgent } from '@/features/routine-agents/server/service'
import { DEFAULT_ROUTINE_AGENT_INPUT } from '@/features/routine-agents/schemas'
import { encryptSecret } from '@/lib/crypto/secretBox'
import { ACTIVE_LIMIT_MESSAGE, TOKEN_LIMIT_MESSAGE } from '@/features/routine-agents/limits'
import { CONFIRMED_TOOL_TIMEOUT_MS, isRoutineActionResolving, RESOLUTION_INTERRUPTED_NOTE } from '@/features/routine-agents/server/run-actions'
import { MAX_RUN_STEPS, pruneRunSteps } from '@/features/routine-agents/server/steps'

const ctx = { sessionId: '', actorId: 'local' }
const call = (input: Parameters<typeof holder.engine>[0], name: string, args: unknown) => input.internalTools.find((tool) => tool.name === name)!.execute(args, ctx)
const flush = async () => {
  for (let i = 0; i < 30; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}
/**
 * Espera a condição com teto de tempo, em vez de contar voltas fixas do event loop: a ativação é
 * lançada sem await (`launch`), e no runner do CI (mais lento e carregado) ela pode não ter chegado ao
 * motor dentro das voltas do `flush`, o que derrubava o teste do MCP da Chamada HTTP (OPE-141).
 */
const waitFor = async (condition: () => boolean, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('Tempo esgotado esperando a condição do teste')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
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
  holder.secrets = createFakeCollection()
  holder.audit = []
  holder.archivedChannels = []
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
  const liveRun = (agentId: unknown, overrides: Record<string, unknown> = {}) =>
    holder.runs.insert({ agentId, seq: 1, origin: 'manual', request: 'Ler as vagas', status: 'running', snapshot: { engine: 'opex', confirmIrreversible: true, limits: EMPTY_ROUTINE_LIMITS, opex: {}, opencode: {} }, queuedAt: new Date(), activationStartedAt: new Date(Date.now() - 10 * 60_000), ...overrides })

  it('regressão OPE-147: execução com batimento recente de outra instância (prévia ou original) não é derrubada', async () => {
    const agent = seedAgent()
    const elsewhere = liveRun(agent._id, { activationId: 'ativacao-da-previa', instance: 'previa#1#abc', heartbeatAt: new Date(Date.now() - 20_000) })
    await runDueRoutineAgents(new Date())
    expect(run(String(elsewhere._id))).toMatchObject({ status: 'running', activationId: 'ativacao-da-previa' })
  })

  it('registro antigo sem batimento conta a partir do início do turno (90 s)', async () => {
    const agent = seedAgent()
    const recent = liveRun(agent._id, { activationStartedAt: new Date(Date.now() - 60_000) })
    await runDueRoutineAgents(new Date())
    expect(run(String(recent._id)).status).toBe('running')
  })

  it('sem batimento há mais de 90 s: volta para a fila uma vez e retoma do último ponto; na segunda interrupção vira Erro', async () => {
    const agent = seedAgent()
    const messages: string[] = []
    holder.engine = async (input) => {
      messages.push((input as unknown as { message: string }).message)
      await new Promise(() => undefined)
      return { error: null, text: '' }
    }
    const now = Date.now()
    const stale = liveRun(agent._id, { activationId: 'velha', instance: 'opex#1#aaa', activationStartedAt: new Date(now - 5 * 60_000), heartbeatAt: new Date(now - 2 * 60_000), waitingMs: 1_000, activeMs: 500 })
    const summary = await runDueRoutineAgents(new Date(now))
    expect(summary.requeued).toBe(1)
    await waitFor(() => messages.length === 1)
    const resumed = run(String(stale._id))
    // Retomou na hora (fila andou): nova ativação deste processo, com a interrupção contada.
    expect(resumed).toMatchObject({ status: 'running', interruptions: 1 })
    expect(resumed.activationId).not.toBe('velha')
    // Ativo até o último batimento (3 min); parado depois dele (2 min) entra como espera.
    expect(resumed.activeMs).toBe(500 + 3 * 60_000)
    expect(resumed.waitingMs).toBeGreaterThanOrEqual(1_000 + 2 * 60_000)
    // Sem histórico salvo (motor Opex): a retomada leva também o disparo, com a nota de interrupção.
    expect(messages[0]).toContain('Ler as vagas')
    expect(messages[0]).toContain(INTERRUPTED_RESUME_NOTE)

    // Segunda interrupção da mesma execução: o turno vivo some (processo morto) e o batimento envelhece.
    resetActivationsForTests()
    holder.runs.docs.find((doc) => doc._id === stale._id)!.heartbeatAt = new Date(now - 2 * 60_000)
    const next = liveRun(agent._id, { seq: 2, status: 'queued', activationStartedAt: null })
    await runDueRoutineAgents(new Date(now))
    expect(run(String(stale._id))).toMatchObject({ status: 'error', error: LOST_TURN_MESSAGE })
    // A fila e a simultaneidade voltam a andar.
    await waitFor(() => run(String(next._id)).status === 'running')
  })

  it('turno antigo que fecha depois de a execução ser retomada noutra ativação não sobrescreve o fecho', async () => {
    const agent = seedAgent()
    let release: () => void = () => undefined
    holder.engine = async (input) => {
      await new Promise<void>((resolve) => (release = resolve))
      await call(input, 'finish', { report: 'Fecho velho' })
      return { error: null, text: '' }
    }
    const { runId } = await triggerRoutineRun(String(agent._id), { origin: 'manual' }, 'local')
    await waitFor(() => run(runId).status === 'running')
    // Outra instância retomou a execução (nova ativação) enquanto este processo estava travado.
    Object.assign(holder.runs.docs.find((doc) => String(doc._id) === runId)!, { activationId: 'outra', instance: 'previa#2#bbb', heartbeatAt: new Date() })
    release()
    await flush()
    expect(run(runId)).toMatchObject({ status: 'running', activationId: 'outra' })
    expect(run(runId).report ?? null).toBeNull()
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

  it('ferramenta confirmada que nunca responde: no teto técnico retoma com "tempo esgotado" e sai do estado de resolução', async () => {
    vi.useFakeTimers()
    try {
      let signal: AbortSignal | undefined
      holder.catalog.set('pendurada', { name: 'pendurada', label: 'MCP pendurado', group: 'mcp', input: { parse: (raw: unknown) => raw }, execute: (_input: unknown, ctx?: unknown) => ((signal = (ctx as { signal?: AbortSignal }).signal), new Promise(() => undefined)) })
      const notes: string[] = []
      holder.engine = intercepted('pendurada', notes)
      const { runId } = await triggerRoutineRun(String(seedAgent()._id), { origin: 'manual' }, 'local')
      await vi.advanceTimersByTimeAsync(50)
      expect(run(runId).status).toBe('awaiting_confirmation')
      const resolving = resolveRoutineAction(runId, 'confirmed', 'local')
      await vi.advanceTimersByTimeAsync(50)
      expect(isRoutineActionResolving(runId)).toBe(true)
      await vi.advanceTimersByTimeAsync(CONFIRMED_TOOL_TIMEOUT_MS + 1_000)
      await resolving
      await vi.advanceTimersByTimeAsync(100)
      expect(signal?.aborted).toBe(true)
      expect(isRoutineActionResolving(runId)).toBe(false)
      expect(notes[1]).toContain('A ação confirmada falhou: tempo esgotado')
      expect(run(runId).status).toBe('completed')
    } finally {
      vi.useRealTimers()
    }
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

  it('OPE-147: provisionamento com batimento recente de outra instância não vai para erro; sem batimento há mais de 90 s, vai', async () => {
    const elsewhere = stale({ provisioningInstance: 'previa#1#abc', provisioningBeatAt: new Date(Date.now() - 30_000) })
    const silent = stale({ provisioningInstance: 'previa#1#abc', provisioningBeatAt: new Date(Date.now() - 100_000) })
    await runDueRoutineAgents(new Date())
    expect(agentDoc(elsewhere._id).provisioning.status).toBe('running')
    expect(agentDoc(silent._id).provisioning).toMatchObject({ status: 'error', error: PROVISIONING_INTERRUPTED_MESSAGE })
    // "Tentar de novo" também respeita o batimento da outra instância.
    await expect(reprovisionRoutineAgent(String(elsewhere._id), 'retry', 'local')).rejects.toMatchObject({ status: 409, code: 'ROUTINE_AGENT_PROVISIONING' })
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

describe('limites ligados ao turno', () => {
  it('OPE-155: o consumo do passo é gravado com a chave de API usada (sem chave = null)', async () => {
    const agent = seedAgent()
    consumption.record.mockClear()
    holder.engine = async (input) => {
      input.onUsage({ tokens: 10, inputTokens: 8, outputTokens: 2, costUsd: null, stepId: '1', model: 'claude', provider: 'anthropic', apiKeyId: 'key_x' })
      input.onUsage({ tokens: 5, inputTokens: 4, outputTokens: 1, costUsd: null, stepId: '2', model: 'claude', provider: 'anthropic' })
      return { error: null, text: '' }
    }
    await triggerRoutineRun(String(agent._id), { origin: 'manual' }, 'local')
    await flush()
    expect(consumption.record).toHaveBeenCalledWith(expect.objectContaining({ provider: 'anthropic', totalTokens: 10, apiKeyId: 'key_x' }))
    expect(consumption.record).toHaveBeenCalledWith(expect.objectContaining({ totalTokens: 5, apiKeyId: null }))
  })

  it('o uso de um passo que alcança o máximo de tokens interrompe o turno → Erro "Limite de tokens atingido"', async () => {
    const agent = seedAgent({ limits: { ...EMPTY_ROUTINE_LIMITS, maxTokens: 100 } })
    holder.engine = async (input) => {
      input.onUsage({ tokens: 60, inputTokens: 50, outputTokens: 10, costUsd: null, stepId: '1', model: 'claude', provider: 'anthropic' })
      expect(input.activation.controller.signal.aborted).toBe(false)
      input.onUsage({ tokens: 50, inputTokens: 40, outputTokens: 10, costUsd: null, stepId: '2', model: 'claude', provider: 'anthropic' })
      expect(input.activation.controller.signal.aborted).toBe(true)
      return { error: null, text: '' }
    }
    const { runId } = await triggerRoutineRun(String(agent._id), { origin: 'manual' }, 'local')
    await flush()
    expect(run(runId)).toMatchObject({ status: 'error', error: TOKEN_LIMIT_MESSAGE, tokens: 110 })
  })

  it('o tempo máximo ativo dispara o temporizador do turno → Erro de tempo ativo', async () => {
    vi.useFakeTimers()
    try {
      const agent = seedAgent({ limits: { ...EMPTY_ROUTINE_LIMITS, maxActiveMinutes: 2 } })
      holder.engine = (input) => new Promise((resolve) => input.activation.controller.signal.addEventListener('abort', () => resolve({ error: null, text: '' })))
      const { runId } = await triggerRoutineRun(String(agent._id), { origin: 'manual' }, 'local')
      await vi.advanceTimersByTimeAsync(2 * 60_000 - 1_000)
      expect(run(runId).status).toBe('running')
      await vi.advanceTimersByTimeAsync(2_000)
      expect(run(runId)).toMatchObject({ status: 'error', error: ACTIVE_LIMIT_MESSAGE })
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('confirmação respondida que não voltou para a fila', () => {
  const resolvedRun = (agentId: unknown, resolvedAt: Date, resumeNote: string | null) =>
    holder.runs.insert({
      agentId,
      seq: 1,
      status: 'awaiting_confirmation',
      origin: 'manual',
      request: null,
      snapshot: { engine: 'opex', confirmIrreversible: true, limits: EMPTY_ROUTINE_LIMITS, opex: {}, opencode: {} },
      parkedAt: new Date(Date.now() - 10 * 60_000),
      queuedAt: new Date(),
      activeMs: 1_000,
      pendingAction: { id: 'p1', summary: 'Excluir a tarefa t1', kind: 'tool', toolName: 'delete_task', toolLabel: 'Excluir tarefa', input: null, displayInput: null, requestedAt: new Date(), resolvedAt, resolution: 'confirmed', note: null },
      resumeNote,
    })

  it('o tick retoma a execução com o texto gravado na resposta (claim feito, fila não)', async () => {
    const agent = seedAgent()
    const messages: string[] = []
    holder.engine = async (input) => {
      messages.push((input as unknown as { message: string }).message)
      await call(input, 'finish', { report: 'Feito' })
      return { error: null, text: '' }
    }
    const stranded = resolvedRun(agent._id, new Date(Date.now() - 5 * 60_000), `Confirmado pelo dono: "Excluir a tarefa t1".\n${RESOLUTION_INTERRUPTED_NOTE}`)
    const recent = resolvedRun(agent._id, new Date(), 'Confirmado')
    await runDueRoutineAgents(new Date())
    await flush()
    expect(run(String(stranded._id)).status).toBe('completed')
    expect(messages[0]).toContain(RESOLUTION_INTERRUPTED_NOTE)
    expect(run(String(recent._id)).status).toBe('awaiting_confirmation')
  })

  it('OPE-147: resposta em andamento noutra instância (batimento recente) não volta para a fila; sem batimento há 90 s, volta', async () => {
    const agent = seedAgent()
    holder.engine = async (input) => {
      await call(input, 'finish', { report: 'Feito' })
      return { error: null, text: '' }
    }
    const resolving = resolvedRun(agent._id, new Date(Date.now() - 10 * 60_000), 'Confirmado')
    const doc = holder.runs.docs.find((item) => item._id === resolving._id)! as { pendingAction: Record<string, unknown> }
    doc.pendingAction.resolvingBy = 'previa#1#abc'
    doc.pendingAction.resolvingBeatAt = new Date(Date.now() - 20_000)
    await runDueRoutineAgents(new Date())
    await flush()
    expect(run(String(resolving._id)).status).toBe('awaiting_confirmation')
    doc.pendingAction.resolvingBeatAt = new Date(Date.now() - 100_000)
    await runDueRoutineAgents(new Date())
    await waitFor(() => run(String(resolving._id)).status === 'completed')
  })

  it('a resposta grava quem a resolve e o batimento', async () => {
    holder.engine = async (input) => {
      ;(input.activation as unknown as { outcome: unknown }).outcome = { kind: 'confirmation', action: { summary: 'Publicar', kind: 'request', toolName: null, toolLabel: null, input: null, displayInput: null } }
      return { error: null, text: '' }
    }
    const { runId } = await triggerRoutineRun(String(seedAgent()._id), { origin: 'manual' }, 'local')
    await waitFor(() => run(runId).status === 'awaiting_confirmation')
    holder.engine = async (input) => {
      await call(input, 'finish', { report: 'Feito' })
      return { error: null, text: '' }
    }
    await resolveRoutineAction(runId, 'confirmed', 'local')
    await waitFor(() => run(runId).status === 'completed')
    expect((run(runId).pendingAction as { resolvingBy: string; resolvingBeatAt: Date })).toMatchObject({ resolvingBy: expect.stringContaining('#'), resolvingBeatAt: expect.any(Date) })
  })

  it('o claim já grava o texto da retomada: uma falha antes da fila deixa a execução recuperável', async () => {
    const notes: string[] = []
    holder.engine = async (input) => {
      notes.push((input as unknown as { message: string }).message)
      if (notes.length === 1) {
        ;(input.activation as unknown as { outcome: unknown }).outcome = { kind: 'confirmation', action: { summary: 'Publicar', kind: 'request', toolName: null, toolLabel: null, input: null, displayInput: null } }
      } else await call(input, 'finish', { report: 'Feito' })
      return { error: null, text: '' }
    }
    const { runId } = await triggerRoutineRun(String(seedAgent()._id), { origin: 'manual' }, 'local')
    await waitFor(() => run(runId).status === 'awaiting_confirmation')
    const original = holder.runs.findOneAndUpdate
    let calls = 0
    // A fila (segunda gravação) falha: simula o processo caindo entre a resposta e a fila.
    holder.runs.findOneAndUpdate = ((...args: Parameters<typeof original>) => {
      if (++calls === 2) throw new Error('banco fora')
      return original(...args)
    }) as typeof original
    await expect(resolveRoutineAction(runId, 'confirmed', 'local')).rejects.toThrow('banco fora')
    holder.runs.findOneAndUpdate = original
    expect(run(runId)).toMatchObject({ status: 'awaiting_confirmation', resumeNote: expect.stringContaining('Confirmado pelo dono: "Publicar"') })
    await expect(resolveRoutineAction(runId, 'confirmed', 'local')).rejects.toMatchObject({ status: 409 })
    await runDueRoutineAgents(new Date(Date.now() + 2 * 60_000))
    await flush()
    expect(run(runId).status).toBe('completed')
    expect(notes[1]).toContain('A ação está liberada')
  })
})

describe('retenção dos passos', () => {
  it('mantém só os passos mais recentes da execução', async () => {
    const runId = fakeId()
    const other = fakeId()
    for (let index = 0; index < 8; index++) holder.steps.insert({ runId, label: `p${index}`, createdAt: new Date(1_000 + index) })
    holder.steps.insert({ runId: other, label: 'outra', createdAt: new Date(1) })
    expect(await pruneRunSteps(runId as never, 3)).toBe(5)
    expect(holder.steps.docs.filter((doc) => String(doc.runId) === String(runId)).map((doc) => doc.label)).toEqual(['p5', 'p6', 'p7'])
    expect(holder.steps.docs.some((doc) => doc.label === 'outra')).toBe(true)
    expect(await pruneRunSteps(runId as never, 3)).toBe(0)
    expect(MAX_RUN_STEPS).toBeGreaterThan(0)
  })
})

describe('cadastro sem nome (critério aprovado OPE-130, D8)', () => {
  const input = { ...DEFAULT_ROUTINE_AGENT_INPUT, instructions: 'Procurar vagas', opex: { ...DEFAULT_ROUTINE_AGENT_INPUT.opex, provider: 'anthropic' as const, model: 'claude' } }

  it('criar sem nome grava slug e chave provisórios e dispara o provisionamento; dois sem nome não colidem', async () => {
    const first = await createRoutineAgent(input, 'local')
    const second = await createRoutineAgent(input, 'local')
    expect(first.slug).toBe(`pendente-${first.id}`)
    expect(first.title).toBe('Agente rotineiro (gerando nome…)')
    expect(second.slug).not.toBe(first.slug)
    expect(holder.agents.docs.map((doc) => doc.nameKey)).toEqual([`pendente:${first.id}`, `pendente:${second.id}`])
    expect(holder.startProvisioning).toHaveBeenCalledWith(first.id, 'create', 'local')
  })

  it('esvaziar o nome de um agente provisionado gera só o nome (modo identity) e tira o selo do campo editado', async () => {
    const agent = seedAgent({ generated: { name: true, objective: true } })
    holder.startProvisioning.mockClear()
    ;(holder.runs as unknown as { aggregate: () => Promise<unknown[]> }).aggregate = async () => []
    await updateRoutineAgent(String(agent._id), { ...input, name: '', objective: 'Novo objetivo' }, 'local')
    expect(holder.agents.docs[0]).toMatchObject({ name: '', nameKey: `pendente:${String(agent._id)}`, generated: { name: false, objective: false } })
    expect(holder.startProvisioning).toHaveBeenCalledWith(String(agent._id), 'identity', 'local')
  })
})

describe('canais de memória na ativação (critério aprovado OPE-130, D13)', () => {
  it('canal extra arquivado no Engramind sai das instruções e da lista de memória, com aviso no relato', async () => {
    holder.archivedChannels = ['experiencia/arquivado']
    const agent = seedAgent({ provisioning: { status: 'ok', error: null, at: null, steps: {}, channels: [], extras: [{ channel: 'experiencia/arquivado', name: 'Arquivado', reason: 'x', created: true }, { channel: 'experiencia/ativo', name: 'Ativo', reason: 'x', created: true }], warnings: [] } })
    let instructions = ''
    let refused: unknown = null
    holder.engine = async (input) => {
      instructions = (input as unknown as { instructions: (prefix: string) => string }).instructions('')
      refused = await call(input, 'list_my_memories', { canal: 'experiencia/arquivado' }).catch((error: unknown) => error)
      await call(input, 'finish', { report: 'Feito' })
      return { error: null, text: '' }
    }
    const { runId } = await triggerRoutineRun(String(agent._id), { origin: 'manual' }, 'local')
    await flush()
    const channelsLine = instructions.split('\n').find((line) => line.includes('num destes canais'))!
    expect(channelsLine).toContain('experiencia/ativo')
    expect(channelsLine).not.toContain('experiencia/arquivado')
    expect(refused).toMatchObject({ code: 'ROUTINE_CHANNEL_NOT_ALLOWED' })
    expect(run(runId).warnings.join(' ')).toContain('Canal arquivado no Engramind, fora desta execução: experiencia/arquivado')
  })
})

describe('segredos e Chamada HTTP na ativação (critério aprovado OPE-130, D5)', () => {
  const VALUE = 'valor-secreto-do-agente'
  const seedSecret = (agentId: unknown) => {
    holder.secrets.insert({ agentId, name: 'GUPY_TOKEN', description: 'Token da Gupy', allowedHosts: ['*.gupy.io'], value: encryptSecret(VALUE), lastUsedAt: null })
  }

  it('motor Opex com a Chamada HTTP liberada: as instruções listam nome, descrição e domínios (sem o valor) e o turno recebe o cofre', async () => {
    const agent = seedAgent({ opex: { provider: 'anthropic', model: 'claude', variant: null, enabledTools: ['http_request'], enabledMcpServers: [] } })
    seedSecret(agent._id)
    let instructions = ''
    let value: string | undefined
    holder.engine = async (input) => {
      const typed = input as unknown as { instructions: (prefix: string) => string; activation: { secrets?: { value: (name: string) => string | undefined } } }
      instructions = typed.instructions('')
      value = typed.activation.secrets?.value('GUPY_TOKEN')
      await call(input, 'finish', { report: 'Feito' })
      return { error: null, text: '' }
    }
    await triggerRoutineRun(String(agent._id), { origin: 'manual' }, 'local')
    await flush()
    expect(instructions).toContain('GUPY_TOKEN — Token da Gupy (só em *.gupy.io)')
    expect(instructions).toContain('{{secret:NOME}}')
    expect(instructions).not.toContain(VALUE)
    expect(value).toBe(VALUE)
  })

  it('motor OpenCode: http_request só entra no MCP da execução com "Chamadas HTTP com segredos" ligado', async () => {
    const names: string[][] = []
    holder.engine = async (input) => {
      names.push(input.internalTools.map((tool) => tool.name))
      await call(input, 'finish', { report: 'Feito' })
      return { error: null, text: '' }
    }
    const off = seedAgent({ slug: 'off', engine: 'opencode', opencode: { model: 'a/b', variant: null, agent: null, enabledMcps: [] } })
    const on = seedAgent({ slug: 'on', engine: 'opencode', opencode: { model: 'a/b', variant: null, agent: null, enabledMcps: [], httpRequests: true } })
    await triggerRoutineRun(String(off._id), { origin: 'manual' }, 'local')
    await waitFor(() => names.length >= 1)
    await triggerRoutineRun(String(on._id), { origin: 'manual' }, 'local')
    await waitFor(() => names.length >= 2)
    expect(names[0]).not.toContain('http_request')
    expect(names[1]).toContain('http_request')
  })

  it('critério aprovado (OPE-130, D6): Chamada HTTP desligada pelo dono no Agente Opex fica fora do MCP da execução, com aviso', async () => {
    holder.opexSettings = { disabledTools: ['http_request'], confirmationOverrides: {} }
    const names: string[][] = []
    holder.engine = async (input) => {
      names.push(input.internalTools.map((tool) => tool.name))
      await call(input, 'finish', { report: 'Feito' })
      return { error: null, text: '' }
    }
    const agent = seedAgent({ slug: 'on2', engine: 'opencode', opencode: { model: 'a/b', variant: null, agent: null, enabledMcps: [], httpRequests: true } })
    const { runId } = await triggerRoutineRun(String(agent._id), { origin: 'manual' }, 'local')
    await flush()
    expect(names[0]).not.toContain('http_request')
    expect(run(runId).warnings).toContain('A ferramenta "Chamada HTTP" está desligada no Agente Opex: a execução segue sem ela.')
    holder.opexSettings = { disabledTools: [], confirmationOverrides: {} }
  })
})

describe('skills no motor Opex (OPE-153)', () => {
  it('configuração antiga sem o campo entra no snapshot com nenhuma skill (D3), sem catálogo nas instruções', async () => {
    holder.opexSkills = [{ name: 'revisar-pr', description: 'Use ao revisar PR' }]
    let instructions = ''
    let names: string[] = []
    holder.engine = async (input) => {
      instructions = (input as unknown as { instructions: (prefix: string) => string }).instructions('')
      names = input.internalTools.map((tool) => tool.name)
      await call(input, 'finish', { report: 'Feito' })
      return { error: null, text: '' }
    }
    const agent = seedAgent()
    const { runId } = await triggerRoutineRun(String(agent._id), { origin: 'manual' }, 'local')
    await flush()
    const snapshot = run(runId).snapshot as { opex: { enabledSkills: string[] }; opencode: { enabledSkills: string[] } }
    expect(snapshot.opex.enabledSkills).toEqual([])
    expect(snapshot.opencode.enabledSkills).toEqual([])
    expect(instructions).not.toContain('Skills disponíveis')
    expect(names).not.toContain('load_opex_skill')
  })

  it('a seleção entra no snapshot: catálogo nas instruções, ferramenta do turno e aviso da skill que sumiu (D6)', async () => {
    holder.opexSkills = [{ name: 'revisar-pr', description: 'Use ao revisar PR' }, { name: 'outra', description: 'Não selecionada' }]
    let instructions = ''
    let names: string[] = []
    holder.engine = async (input) => {
      instructions = (input as unknown as { instructions: (prefix: string) => string }).instructions('')
      names = input.internalTools.map((tool) => tool.name)
      await call(input, 'finish', { report: 'Feito' })
      return { error: null, text: '' }
    }
    const agent = seedAgent({ slug: 'skills', opex: { provider: 'anthropic', model: 'claude', variant: null, enabledTools: [], enabledMcpServers: [], enabledSkills: ['revisar-pr', 'apagada'] } })
    const { runId } = await triggerRoutineRun(String(agent._id), { origin: 'manual' }, 'local')
    await flush()
    expect((run(runId).snapshot as { opex: { enabledSkills: string[] } }).opex.enabledSkills).toEqual(['revisar-pr', 'apagada'])
    expect(instructions).toContain('- revisar-pr: Use ao revisar PR')
    expect(instructions).not.toContain('outra')
    expect(names).toContain('load_opex_skill')
    expect(run(runId).warnings).toContain('Skill indisponível (removida do Agente Opex), fora desta execução: apagada.')
    holder.opexSkills = []
  })
})

describe('seleção de skills no cadastro (OPE-153)', () => {
  const input = { ...DEFAULT_ROUTINE_AGENT_INPUT, instructions: 'Procurar vagas', opex: { ...DEFAULT_ROUTINE_AGENT_INPUT.opex, provider: 'anthropic' as const, model: 'claude' } }

  it('skill do Agente Opex inexistente recém-adicionada é recusada (400) ao criar e ao editar; skill do host não é conferida', async () => {
    holder.opexSkills = [{ name: 'revisar-pr', description: 'x' }]
    await expect(createRoutineAgent({ ...input, opex: { ...input.opex, enabledSkills: ['nao-existe'] } }, 'local')).rejects.toMatchObject({ status: 400, code: 'ROUTINE_SKILL_NOT_FOUND' })
    const created = await createRoutineAgent({ ...input, opex: { ...input.opex, enabledSkills: ['revisar-pr'] }, opencode: { ...input.opencode, enabledSkills: ['so-no-host'] } }, 'local')
    expect(created.opex.enabledSkills).toEqual(['revisar-pr'])
    ;(holder.runs as unknown as { aggregate: () => Promise<unknown[]> }).aggregate = async () => []
    await expect(updateRoutineAgent(created.id, { ...input, opex: { ...input.opex, enabledSkills: ['revisar-pr', 'nova-inexistente'] } }, 'local')).rejects.toMatchObject({ code: 'ROUTINE_SKILL_NOT_FOUND' })
    holder.opexSkills = []
  })

  it('skill já salva que foi removida do Agente Opex (D6) não impede editar o agente', async () => {
    holder.opexSkills = [{ name: 'revisar-pr', description: 'x' }]
    const created = await createRoutineAgent({ ...input, opex: { ...input.opex, enabledSkills: ['revisar-pr'] } }, 'local')
    holder.opexSkills = []
    ;(holder.runs as unknown as { aggregate: () => Promise<unknown[]> }).aggregate = async () => []
    const updated = await updateRoutineAgent(created.id, { ...input, objective: 'Novo', opex: { ...input.opex, enabledSkills: ['revisar-pr'] } }, 'local')
    expect(updated.opex.enabledSkills).toEqual(['revisar-pr'])
  })
})

describe('critério aprovado (OPE-130, D9): agente gravado com o OpenCode no motor Opex', () => {
  it('o DTO chega com o provedor vazio e o disparo é recusado (409) sem criar execução', async () => {
    const agent = seedAgent({ opex: { provider: 'opencode', model: 'anthropic/claude', variant: null, enabledTools: [], enabledMcpServers: [] } })
    const { toAgentDto } = await import('@/features/routine-agents/server/shared')
    const dto = toAgentDto(agent as never)
    expect(dto.opex).toMatchObject({ provider: null, model: '' })
    await expect(triggerRoutineRun(String(agent._id), { origin: 'manual' }, 'local')).rejects.toMatchObject({ status: 409, code: 'ROUTINE_ENGINE_PROVIDER_INVALID' })
    expect(holder.runs.docs).toHaveLength(0)
  })

  it('uma execução já na fila com esse snapshot termina em Erro sem chamar o modelo', async () => {
    const { runOpexEngine } = await vi.importActual<typeof import('@/features/routine-agents/server/engines/opex')>('@/features/routine-agents/server/engines/opex')
    const result = await runOpexEngine({ agent: {}, run: { snapshot: { opex: { provider: 'opencode', model: 'x', variant: null, enabledTools: [], enabledMcpServers: [] } }, messages: null }, activation: { controller: new AbortController(), warnings: [] } } as never)
    expect(result.error).toContain('O motor Opex não usa o OpenCode')
  })
})

void fakeId

describe('métricas da lista (critério aprovado OPE-130, D18)', () => {
  it('a lista e a Visão geral do agente devolvem os mesmos números; agente sem execuções vem zerado', async () => {
    const { getRoutineAgentMetrics, getRoutineAgentsMetrics } = await import('@/features/routine-agents/server/run-queries')
    const busy = seedAgent({ slug: 'cheio' })
    const idle = seedAgent({ slug: 'vazio' })
    const at = new Date('2026-11-04T15:00:00Z')
    for (const status of ['completed', 'completed', 'error']) holder.runs.insert({ agentId: busy._id, status, activeMs: 1000, tokens: 500, costUsd: null, costPartial: false, createdAt: at })
    const range = { from: new Date('2026-11-01T03:00:00Z'), to: new Date('2026-11-05T03:00:00Z') }
    const all = await getRoutineAgentsMetrics(range)
    const single = await getRoutineAgentMetrics(String(busy._id), range)
    expect(all[String(busy._id)]!.kpis).toEqual(single.kpis)
    expect(all[String(busy._id)]!.days).toEqual(single.days)
    expect(all[String(busy._id)]!.kpis).toMatchObject({ runs: 3, completed: 2, errors: 1, tokens: 1500 })
    expect(all[String(idle._id)]!.kpis).toMatchObject({ runs: 0, completed: 0, errors: 0, tokens: 0 })
  })
})
