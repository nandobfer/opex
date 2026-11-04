import { act } from '@testing-library/react'
import type { LiveEvent } from '@engramind/client'

/**
 * SSE da rede do Engramind nos testes (OPE-116): um `EventSource` falso no happy-dom. `emitLive` entrega um
 * evento a todas as conexões abertas; `emitConsumption` entrega o consumo como o webhook `memory.consumed`
 * (um evento por canal) e espera a janela de agrupamento da lib.
 */
type Listener = (event: { data?: string }) => void

export class FakeEventSource {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2
  static instances: FakeEventSource[] = []
  readonly url: string
  readyState = FakeEventSource.OPEN
  private listeners = new Map<string, Set<Listener>>()
  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }
  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, (this.listeners.get(type) ?? new Set()).add(listener))
  }
  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener)
  }
  close() {
    this.readyState = FakeEventSource.CLOSED
    FakeEventSource.instances = FakeEventSource.instances.filter((item) => item !== this)
  }
  fire(type: string, data?: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener(data === undefined ? {} : { data: JSON.stringify(data) })
  }
}

export function installFakeEventSource() {
  FakeEventSource.instances = []
  Object.defineProperty(window, 'EventSource', { configurable: true, writable: true, value: FakeEventSource })
  Object.defineProperty(globalThis, 'EventSource', { configurable: true, writable: true, value: FakeEventSource })
}

export const liveConnections = () => FakeEventSource.instances

export function emitLive(event: LiveEvent) {
  act(() => {
    for (const source of [...FakeEventSource.instances]) source.fire('engramind', event)
  })
}

let consumptionSeq = 0
/** Janela de agrupamento da lib (`CONSUMPTION_GROUP_WINDOW_MS`) com folga. */
export const CONSUMPTION_WAIT_MS = 500

export async function emitConsumption(payload: { agent: string | null; kind?: 'context' | 'search'; channels: string[]; delivered?: string[]; memoryIds: string[] }) {
  consumptionSeq += 1
  const consumption = `cns_teste_${consumptionSeq}`
  const operation = payload.kind === 'search' ? 'search_memories' : 'get_context'
  const channels = payload.delivered?.length ? payload.delivered : payload.channels
  for (const channel of channels) emitLive({ type: "memory.consumed", channel, memoryIds: payload.memoryIds, consumption, operation, agent: payload.agent })
  await act(() => new Promise((resolve) => setTimeout(resolve, CONSUMPTION_WAIT_MS)))
}
