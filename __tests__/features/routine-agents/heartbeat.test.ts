import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeCollection, type FakeCollection } from '../../helpers/fake-collection'

/**
 * Batimento das instâncias (OPE-147): a prévia do Opex e o Opex original usam o mesmo banco, e cada
 * processo grava a cada 15 s o batimento do que roda nele (turnos, provisionamentos e respostas a
 * confirmações). Só a ativação dona bate; uma execução fechada ou retomada noutra instância interrompe
 * o turno local.
 */

const holder = vi.hoisted(() => ({
  agents: null as unknown as FakeCollection,
  runs: null as unknown as FakeCollection,
}))

vi.mock('@/lib/db/models/RoutineAgent', () => ({
  get RoutineAgent() {
    return holder.agents
  },
  get RoutineRun() {
    return holder.runs
  },
}))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: async () => undefined }))

import { beatOnce, ensureHeartbeat, HEARTBEAT_INTERVAL_MS, HEARTBEAT_STALE_MS, isBeatStale, isHeartbeatRunning, stopHeartbeat } from '@/features/routine-agents/server/heartbeat'
import { activationOf, beginActivation, beginResolving, resetActivationsForTests } from '@/features/routine-agents/server/hub'
import { inFlight, isProvisioningLive } from '@/features/routine-agents/server/provisioning-registry'
import { INSTANCE_ID } from '@/lib/instance'

const doc = (collection: FakeCollection, id: unknown) => collection.docs.find((item) => item._id === id)! as Record<string, unknown>

beforeEach(() => {
  holder.agents = createFakeCollection()
  holder.runs = createFakeCollection()
  resetActivationsForTests()
  inFlight.clear()
  stopHeartbeat()
})
afterEach(() => {
  stopHeartbeat()
  vi.useRealTimers()
})

describe('isBeatStale', () => {
  it('vale 90 s: dentro da folga está vivo, depois dela está interrompido; sem data, interrompido', () => {
    const now = new Date('2026-11-07T12:00:00Z')
    expect(HEARTBEAT_STALE_MS).toBe(90_000)
    expect(HEARTBEAT_INTERVAL_MS).toBe(15_000)
    expect(isBeatStale(new Date(now.getTime() - 90_000), now)).toBe(false)
    expect(isBeatStale(new Date(now.getTime() - 90_001), now)).toBe(true)
    // Diferença pequena de relógio (batimento "no futuro") não derruba.
    expect(isBeatStale(new Date(now.getTime() + 5_000), now)).toBe(false)
    expect(isBeatStale(null, now)).toBe(true)
  })
})

describe('beatOnce', () => {
  it('bate só pela ativação dona; execução retomada noutra ativação interrompe o turno local', async () => {
    const mine = holder.runs.insert({ status: 'running', activationId: 'a1', heartbeatAt: null })
    const taken = holder.runs.insert({ status: 'running', activationId: 'outra', heartbeatAt: null })
    beginActivation({ runId: String(mine._id), agentId: 'x', activationId: 'a1', baseTokens: 0, baseActiveMs: 0 })
    const stale = beginActivation({ runId: String(taken._id), agentId: 'x', activationId: 'a2', baseTokens: 0, baseActiveMs: 0 })
    const now = new Date()
    expect(await beatOnce(now)).toBe(true)
    expect(doc(holder.runs, mine._id)).toMatchObject({ heartbeatAt: now, instance: INSTANCE_ID })
    expect(doc(holder.runs, taken._id).heartbeatAt).toBeNull()
    expect(stale.controller.signal.aborted).toBe(true)
    expect(activationOf(String(mine._id))?.controller.signal.aborted).toBe(false)
  })

  it('bate pelos provisionamentos e pelas respostas a confirmações desta instância', async () => {
    const agent = holder.agents.insert({ provisioning: { status: 'running', at: new Date(Date.now() - 10 * 60_000) }, provisioningInstance: INSTANCE_ID, provisioningBeatAt: null })
    const other = holder.agents.insert({ provisioning: { status: 'running', at: new Date(Date.now() - 10 * 60_000) }, provisioningInstance: 'previa#1#abc', provisioningBeatAt: null })
    const resolving = holder.runs.insert({ status: 'awaiting_confirmation', pendingAction: { id: 'p1', resolvedAt: new Date(), resolvingBy: INSTANCE_ID, resolvingBeatAt: null } })
    inFlight.set(String(agent._id), new Promise(() => undefined))
    inFlight.set(String(other._id), new Promise(() => undefined))
    beginResolving(String(resolving._id))
    const now = new Date()
    await beatOnce(now)
    expect(doc(holder.agents, agent._id).provisioningBeatAt).toEqual(now)
    expect(doc(holder.agents, other._id).provisioningBeatAt).toBeNull()
    expect((doc(holder.runs, resolving._id).pendingAction as Record<string, unknown>).resolvingBeatAt).toEqual(now)
  })

  it('nada vivo: não grava e o laço se desliga', async () => {
    vi.useFakeTimers()
    expect(await beatOnce()).toBe(false)
    ensureHeartbeat()
    expect(isHeartbeatRunning()).toBe(true)
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS)
    expect(isHeartbeatRunning()).toBe(false)
  })
})

describe('isProvisioningLive', () => {
  it('vivo neste processo ou com batimento recente de outra instância; registro antigo conta do início', () => {
    const now = new Date()
    const running = (extra: Record<string, unknown>) => ({ _id: 'ag1', provisioning: { status: 'running', at: new Date(now.getTime() - 10 * 60_000) }, ...extra })
    expect(isProvisioningLive(running({ provisioningBeatAt: new Date(now.getTime() - 30_000) }), now)).toBe(true)
    expect(isProvisioningLive(running({ provisioningBeatAt: new Date(now.getTime() - 100_000) }), now)).toBe(false)
    expect(isProvisioningLive(running({}), now)).toBe(false)
    expect(isProvisioningLive({ _id: 'ag1', provisioning: { status: 'running', at: new Date(now.getTime() - 60_000) } }, now)).toBe(true)
    expect(isProvisioningLive({ _id: 'ag1', provisioning: { status: 'ok', at: null }, provisioningBeatAt: now }, now)).toBe(false)
    // Batimento antigo de um provisionamento já terminado não derruba um "Reprovisionar" recém-iniciado.
    expect(isProvisioningLive({ _id: 'ag1', provisioning: { status: 'running', at: new Date(now.getTime() - 5_000) }, provisioningBeatAt: new Date(now.getTime() - 3 * 86_400_000) }, now)).toBe(true)
    inFlight.set('ag1', new Promise(() => undefined))
    expect(isProvisioningLive(running({}), now)).toBe(true)
  })
})
