import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeEngramind, type FakeEngramind } from '../../helpers/fake-engramind'
import { createFakeCollection, type FakeCollection } from '../../helpers/fake-collection'

/**
 * Canais extras sob controle do dono (OPE-143): Remover cancela só a assinatura exata no Engramind e bloqueia o
 * canal NO AGENTE; o provisionamento nunca mais o assina nem cria; falha do Engramind não altera o registro;
 * o bloqueio é reversível (desbloquear / assinar de novo).
 */

const holder = vi.hoisted(() => ({
  fake: null as unknown as FakeEngramind,
  agents: null as unknown as FakeCollection,
  settings: null as unknown as FakeCollection,
  planner: '{"subscribe":[],"create":[]}',
  prompts: [] as string[],
  failDelete: false,
  failSubscribe: false,
  /** Segura o DELETE até ser liberado (ação de canal lenta na rede). */
  gate: null as null | Promise<void>,
  deleteStarted: 0,
  audits: [] as { entidadeId: string; depois?: Record<string, unknown>; antes?: Record<string, unknown> }[],
  events: [] as string[],
}))

vi.mock('@/lib/db', () => ({
  dbConnect: async () => undefined,
  recordAudit: async (entry: { entidadeId: string; depois?: Record<string, unknown>; antes?: Record<string, unknown> }) => void holder.audits.push(entry),
  AcaoAuditoria: { EXECUTAR: 'EXECUTAR', ATUALIZAR: 'ATUALIZAR', CRIAR: 'CRIAR' },
}))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: async (event: string) => void holder.events.push(event) }))
vi.mock('@/lib/db/models/RoutineAgent', () => ({
  get RoutineAgent() {
    return holder.agents
  },
  get RoutineAgentSettings() {
    return holder.settings
  },
  RoutineRun: { aggregate: async () => [] },
}))
vi.mock('@/features/engramind/server/client', () => ({
  engramindCall: async (...args: Parameters<FakeEngramind['engramindCall']>) => {
    if (args[0] === 'DELETE') {
      holder.deleteStarted++
      if (holder.gate) await holder.gate
    }
    if (holder.failDelete && args[0] === 'DELETE') throw new Error('Engramind fora do ar')
    if (holder.failSubscribe && args[0] === 'POST' && args[1].path === '/v1/subscriptions') throw new Error('Engramind recusou a assinatura')
    return holder.fake.engramindCall(...args)
  },
  engramindTarget: async () => ({ baseUrl: 'http://engramind', token: 'admin-token' }),
}))
vi.mock('@/features/engramind/server/shared', () => ({ AcaoAuditoria: { EXECUTAR: 'EXECUTAR' }, auditEngramind: async () => undefined, engramindLog: { warn: () => undefined, info: () => undefined } }))
vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: async () => ({}) }))
vi.mock('@/features/engramind/server/memory-network', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/features/engramind/server/memory-network')>()
  return { ...original, ensureAppToken: async () => null }
})
vi.mock('@/lib/ai/stream', () => ({
  streamAi: async function* (input: { prompt: string }) {
    holder.prompts.push(input.prompt)
    yield { type: 'delta', text: holder.planner }
  },
}))

import { provisionRoutineAgent, startProvisioning } from '@/features/routine-agents/server/provisioning'
import { inFlight } from '@/features/routine-agents/server/provisioning-registry'
import { applyRoutineChannelAction, blockRoutineChannel, unblockRoutineChannel } from '@/features/routine-agents/server/provisioning-channels'

const AGENT = 'opex/rotineiro-vagas'
const OTHER = 'opex/rotineiro-outro'
const agentDoc = () => holder.agents.docs[0]!
const agentId = () => String(agentDoc()._id)
const provisioning = () => (agentDoc() as unknown as { provisioning: { status: string; extras: { channel: string }[]; blocked: { channel: string; name: string }[]; warnings: string[] } }).provisioning
const extras = () => provisioning().extras.map((item) => item.channel)
const blockedList = () => provisioning().blocked.map((item) => item.channel)
const subscribed = (agent = AGENT) => holder.fake.state.subscriptions.filter((item) => item.agent === agent).map((item) => item.target)
const calls = (method: string, path: string) => holder.fake.state.calls.filter((call) => call.method === method && call.path === path)
const deletes = () => holder.fake.state.calls.filter((call) => call.method === 'DELETE')
const subscribes = () => calls('POST', '/v1/subscriptions').map((call) => (call.body as { target: string }).target)

beforeEach(async () => {
  process.env.INTEGRATIONS_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64')
  holder.fake = createFakeEngramind()
  holder.fake.state.channels.set('opex', { slug: 'opex', archived_at: null })
  holder.fake.state.channels.set('vagas/empresa-x', { slug: 'vagas/empresa-x', archived_at: null })
  holder.fake.state.channels.set('experiencia/desenvolvimento', { slug: 'experiencia/desenvolvimento', archived_at: null })
  holder.agents = createFakeCollection()
  holder.settings = createFakeCollection()
  holder.settings.insert({ _id: 'default', provider: 'anthropic', model: 'claude', variant: null, agent: null })
  holder.planner = '{"subscribe":[{"channel":"vagas/empresa-x","reason":"vagas"},{"channel":"experiencia/desenvolvimento","reason":"experiência"}],"create":[]}'
  holder.prompts = []
  holder.failDelete = false
  holder.failSubscribe = false
  holder.gate = null
  holder.deleteStarted = 0
  holder.audits = []
  holder.events = []
  inFlight.clear()
  holder.agents.insert({ name: 'Vagas', slug: 'vagas', objective: 'Candidatar-se', instructions: '', engine: 'opex', status: 'active', provisioning: { status: 'pending', steps: { agent: false, token: false, channels: false, extras: false, workdir: false }, channels: [], extras: [], blocked: [], warnings: [] }, engramindToken: null })
  await provisionRoutineAgent(agentId(), 'create', 'local')
  holder.fake.state.calls.length = 0
  holder.audits = []
  holder.events = []
})

describe('remover (bloquear) um canal extra', () => {
  it('cancela só a assinatura exata, preserva o canal e os outros assinantes e bloqueia no agente', async () => {
    holder.fake.state.subscriptions.push({ agent: OTHER, target: 'vagas/empresa-x', mode: 'inject' })
    expect(extras()).toEqual(['vagas/empresa-x', 'experiencia/desenvolvimento'])

    const dto = await blockRoutineChannel(agentId(), 'vagas/empresa-x', 'local')

    expect(deletes()).toHaveLength(1)
    expect(decodeURIComponent(deletes()[0]!.path)).toContain(`${AGENT}|vagas/empresa-x`)
    expect(subscribed()).not.toContain('vagas/empresa-x')
    expect(subscribed()).toEqual(expect.arrayContaining(['opex', 'agentes/rotineiros/global', 'agentes/rotineiros/vagas', 'experiencia/desenvolvimento']))
    // Canal intacto e o outro agente continua assinando.
    expect(holder.fake.state.channels.has('vagas/empresa-x')).toBe(true)
    expect(subscribed(OTHER)).toEqual(['vagas/empresa-x'])
    expect(extras()).toEqual(['experiencia/desenvolvimento'])
    expect(blockedList()).toEqual(['vagas/empresa-x'])
    expect(dto.provisioning.blocked.map((item) => item.channel)).toEqual(['vagas/empresa-x'])
    expect(dto.provisioning.extras.map((item) => item.channel)).toEqual(['experiencia/desenvolvimento'])
    // Auditoria (antes/depois) e tempo real.
    expect(holder.audits).toHaveLength(1)
    expect(holder.audits[0]).toMatchObject({ entidadeId: agentId(), antes: { extras: ['vagas/empresa-x', 'experiencia/desenvolvimento'], bloqueados: [] }, depois: { evento: 'remover canal extra', canal: 'vagas/empresa-x', assinatura: 'removed', bloqueados: ['vagas/empresa-x'] } })
    expect(holder.events).toContain('routine-agent-updated')
  })

  it('o bloqueio é do agente: bloquear num agente não toca o bloqueio nem a assinatura de outro', async () => {
    holder.agents.insert({ name: 'Outro', slug: 'outro', objective: 'x', instructions: '', engine: 'opex', status: 'active', provisioning: { status: 'ok', steps: { agent: true, token: true, channels: true, extras: true, workdir: true }, channels: [], extras: [{ channel: 'vagas/empresa-x', name: 'x', reason: 'r', created: false }], blocked: [], warnings: [] }, engramindToken: null })
    holder.fake.state.subscriptions.push({ agent: OTHER, target: 'vagas/empresa-x', mode: 'inject' })
    await blockRoutineChannel(agentId(), 'vagas/empresa-x', 'local')
    const other = holder.agents.docs[1] as unknown as { provisioning: { extras: unknown[]; blocked: unknown[] } }
    expect(other.provisioning.blocked).toEqual([])
    expect(other.provisioning.extras).toHaveLength(1)
    expect(subscribed(OTHER)).toContain('vagas/empresa-x')
  })

  it('falha no Engramind: erro acionável e o registro do agente não muda', async () => {
    holder.failDelete = true
    await expect(blockRoutineChannel(agentId(), 'vagas/empresa-x', 'local')).rejects.toMatchObject({ status: 502, code: 'ROUTINE_CHANNEL_ENGRAMIND_FAILED', message: expect.stringContaining('Nada foi alterado') })
    expect(extras()).toEqual(['vagas/empresa-x', 'experiencia/desenvolvimento'])
    expect(blockedList()).toEqual([])
    expect(subscribed()).toContain('vagas/empresa-x')
    expect(holder.audits).toHaveLength(0)
    expect(holder.events).toHaveLength(0)
  })

  it('canal fora dos extras (caso Garimpeiro): bloqueia; assinatura já cancelada à mão não é erro', async () => {
    holder.fake.state.channels.set('dndicas/opex/admin', { slug: 'dndicas/opex/admin', archived_at: null })
    await blockRoutineChannel(agentId(), 'dndicas/opex/admin', 'local')
    expect(deletes()).toHaveLength(0)
    expect(blockedList()).toEqual(['dndicas/opex/admin'])
    expect(extras()).toEqual(['vagas/empresa-x', 'experiencia/desenvolvimento'])
    expect(holder.audits[0]).toMatchObject({ depois: { evento: 'bloquear canal', assinatura: 'absent' } })
  })

  it('canal fora dos extras que o agente ainda assina: a assinatura é cancelada', async () => {
    holder.fake.state.subscriptions.push({ agent: AGENT, target: 'dndicas/opex/admin', mode: 'inject' })
    await blockRoutineChannel(agentId(), 'dndicas/opex/admin', 'local')
    expect(deletes()).toHaveLength(1)
    expect(subscribed()).not.toContain('dndicas/opex/admin')
  })

  it('bloquear duas vezes não repete a chamada nem a auditoria', async () => {
    await blockRoutineChannel(agentId(), 'vagas/empresa-x', 'local')
    await blockRoutineChannel(agentId(), 'vagas/empresa-x', 'local')
    expect(deletes()).toHaveLength(1)
    expect(blockedList()).toEqual(['vagas/empresa-x'])
    expect(holder.audits).toHaveLength(1)
  })

  it('recusa canal base (400) e provisionamento em andamento (409), sem tocar o Engramind', async () => {
    await expect(blockRoutineChannel(agentId(), 'opex', 'local')).rejects.toMatchObject({ status: 400, code: 'ROUTINE_CHANNEL_BASE' })
    await expect(blockRoutineChannel(agentId(), 'agentes/rotineiros/global', 'local')).rejects.toMatchObject({ code: 'ROUTINE_CHANNEL_BASE' })
    await expect(blockRoutineChannel(agentId(), 'agentes/rotineiros/vagas', 'local')).rejects.toMatchObject({ code: 'ROUTINE_CHANNEL_BASE' })
    await expect(blockRoutineChannel(agentId(), 'agentes/rotineiros/outro', 'local')).rejects.toMatchObject({ status: 400, code: 'ROUTINE_CHANNEL_INVALID' })
    inFlight.set(agentId(), new Promise(() => undefined))
    await expect(blockRoutineChannel(agentId(), 'vagas/empresa-x', 'local')).rejects.toMatchObject({ status: 409, code: 'ROUTINE_AGENT_PROVISIONING' })
    expect(deletes()).toHaveLength(0)
    expect(blockedList()).toEqual([])
  })
})

describe('ações simultâneas no mesmo agente (F1)', () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 5))

  it('duas remoções quase simultâneas de canais diferentes mantêm as duas (a segunda não sobrescreve a primeira)', async () => {
    let release!: () => void
    holder.gate = new Promise<void>((resolve) => (release = resolve))
    const first = blockRoutineChannel(agentId(), 'vagas/empresa-x', 'local')
    const second = blockRoutineChannel(agentId(), 'experiencia/desenvolvimento', 'local')
    await tick()
    // A segunda espera a primeira terminar: só um DELETE em andamento.
    expect(holder.deleteStarted).toBe(1)
    release()
    await Promise.all([first, second])
    expect(extras()).toEqual([])
    expect(blockedList().sort()).toEqual(['experiencia/desenvolvimento', 'vagas/empresa-x'])
    expect(subscribed()).not.toContain('vagas/empresa-x')
    expect(subscribed()).not.toContain('experiencia/desenvolvimento')
  })

  it('Reprovisionar iniciado durante a chamada ao Engramind espera a ação e não apaga o bloqueio recém-gravado', async () => {
    let release!: () => void
    holder.gate = new Promise<void>((resolve) => (release = resolve))
    holder.planner = '{"subscribe":[{"channel":"vagas/empresa-x","reason":"de novo"}],"create":[]}'
    const action = blockRoutineChannel(agentId(), 'vagas/empresa-x', 'local')
    await tick()
    const promptsBefore = holder.prompts.length
    const provisioningRun = startProvisioning(agentId(), 'reprovision', 'local')
    await tick()
    // Ainda não leu o agente nem chamou o subagente.
    expect(holder.prompts).toHaveLength(promptsBefore)
    release()
    await Promise.all([action, provisioningRun])
    expect(blockedList()).toEqual(['vagas/empresa-x'])
    expect(extras()).toEqual(['experiencia/desenvolvimento'])
    expect(subscribed()).not.toContain('vagas/empresa-x')
    expect(holder.prompts.at(-1)).toContain('Bloqueados pelo dono')
  })

  it('uma ação que falha não trava a fila: a seguinte roda', async () => {
    holder.failDelete = true
    await expect(blockRoutineChannel(agentId(), 'vagas/empresa-x', 'local')).rejects.toMatchObject({ status: 502 })
    holder.failDelete = false
    await blockRoutineChannel(agentId(), 'experiencia/desenvolvimento', 'local')
    expect(blockedList()).toEqual(['experiencia/desenvolvimento'])
    expect(extras()).toEqual(['vagas/empresa-x'])
  })
})

describe('o provisionamento respeita os bloqueados', () => {
  it('Reprovisionar depois da remoção não traz o canal de volta (mesmo proposto em subscribe e em create) e informa o subagente', async () => {
    await blockRoutineChannel(agentId(), 'experiencia/desenvolvimento', 'local')
    holder.fake.state.calls.length = 0
    holder.planner = '{"subscribe":[{"channel":"experiencia/desenvolvimento","reason":"de novo"}],"create":[{"slug":"experiencia/desenvolvimento","name":"Exp","reason":"de novo"},{"slug":"dndicas/opex/admin","name":"Admin","reason":"x"}]}'
    holder.fake.state.channels.set('dndicas/opex/admin', { slug: 'dndicas/opex/admin', archived_at: null })
    await blockRoutineChannel(agentId(), 'dndicas/opex/admin', 'local')

    await provisionRoutineAgent(agentId(), 'reprovision', 'local')

    expect(provisioning().status).toBe('ok')
    expect(extras()).toEqual(['vagas/empresa-x'])
    expect(blockedList()).toEqual(['experiencia/desenvolvimento', 'dndicas/opex/admin'])
    expect(subscribes()).not.toContain('experiencia/desenvolvimento')
    expect(subscribes()).not.toContain('dndicas/opex/admin')
    expect(subscribed()).not.toContain('experiencia/desenvolvimento')
    expect(provisioning().warnings.some((warning) => warning.includes('experiencia/desenvolvimento') && warning.includes('bloqueado'))).toBe(true)
    const prompt = holder.prompts.at(-1)!
    expect(prompt).toContain('Bloqueados pelo dono')
    expect(prompt).toContain('experiencia/desenvolvimento, dndicas/opex/admin')
  })

  it('"Tentar de novo" preserva a lista de bloqueados', async () => {
    await blockRoutineChannel(agentId(), 'vagas/empresa-x', 'local')
    await provisionRoutineAgent(agentId(), 'retry', 'local')
    expect(blockedList()).toEqual(['vagas/empresa-x'])
    expect(extras()).toEqual(['experiencia/desenvolvimento'])
  })
})

describe('reverter o bloqueio', () => {
  beforeEach(async () => {
    await blockRoutineChannel(agentId(), 'vagas/empresa-x', 'local')
    holder.fake.state.calls.length = 0
    holder.audits = []
  })

  it('desbloquear só retira do bloqueio, sem assinar', async () => {
    await unblockRoutineChannel(agentId(), 'vagas/empresa-x', {}, 'local')
    expect(blockedList()).toEqual([])
    expect(extras()).toEqual(['experiencia/desenvolvimento'])
    expect(subscribes()).toEqual([])
    expect(holder.audits[0]).toMatchObject({ depois: { evento: 'desbloquear canal' } })
  })

  it('assinar de novo assina, devolve aos extras e retira do bloqueio', async () => {
    const dto = await applyRoutineChannelAction(agentId(), 'resubscribe', 'vagas/empresa-x', 'local')
    expect(subscribed()).toContain('vagas/empresa-x')
    expect(blockedList()).toEqual([])
    expect(extras()).toEqual(['experiencia/desenvolvimento', 'vagas/empresa-x'])
    expect(dto.provisioning.extras.at(-1)).toMatchObject({ channel: 'vagas/empresa-x', created: false })
    expect(holder.audits[0]).toMatchObject({ depois: { evento: 'assinar canal de novo' } })
  })

  it('assinar de novo com falha no Engramind mantém o bloqueio', async () => {
    holder.failSubscribe = true
    await expect(unblockRoutineChannel(agentId(), 'vagas/empresa-x', { resubscribe: true }, 'local')).rejects.toMatchObject({ status: 502 })
    expect(blockedList()).toEqual(['vagas/empresa-x'])
    expect(extras()).toEqual(['experiencia/desenvolvimento'])
  })

  it('canal que não está bloqueado: 404; limite de extras: 409', async () => {
    await expect(unblockRoutineChannel(agentId(), 'nao/bloqueado', {}, 'local')).rejects.toMatchObject({ status: 404, code: 'ROUTINE_CHANNEL_NOT_BLOCKED' })
    const full = Array.from({ length: 8 }, (_, index) => ({ channel: `c/${index}`, name: `c${index}`, reason: 'r', created: false }))
    await (await import('@/lib/db/models/RoutineAgent')).RoutineAgent.updateOne({ _id: agentId() } as never, { $set: { 'provisioning.extras': full } } as never)
    await expect(unblockRoutineChannel(agentId(), 'vagas/empresa-x', { resubscribe: true }, 'local')).rejects.toMatchObject({ status: 409, code: 'ROUTINE_CHANNEL_LIMIT' })
    expect(blockedList()).toEqual(['vagas/empresa-x'])
  })
})
