import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LiveEvent } from '@engramind/client'

/** OPE-116: o webhook vai ao SSE da rede (barramento da lib) e o consumo agrupado ao Pusher da atividade. */

const mocks = vi.hoisted(() => ({ app: vi.fn(async () => {}) }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.app }))
vi.mock('@/features/engramind/server/shared', () => ({ engramindLog: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))

import { consumptionPayload, engramindBus, forwardWebhookLive, publishLive } from '@/features/engramind/server/live'

const consumed = (channel: string, ids: string[], extra: Record<string, unknown> = {}) => ({ id: `evt_${channel}_${ids.join()}`, type: 'memory.consumed', channel, memory_ids: ids, consumption: 'cns_9', operation: 'get_context', app: 'opex', agent: 'opex/desenvolvedor', ...extra })

beforeEach(() => {
  vi.useFakeTimers()
  mocks.app.mockClear()
})
afterEach(() => vi.useRealTimers())

describe('tempo real da rede (SSE)', () => {
  it('o webhook chega ao SSE só com ids, slugs e tipos', async () => {
    const got: LiveEvent[] = []
    const off = engramindBus().subscribe((event) => got.push(event))
    await forwardWebhookLive({ id: 'evt_1', type: 'memory.created', channel: 'opex', memory_ids: ['m_1'], at: '2026-11-01T00:00:00Z' })
    off()
    expect(got).toEqual([{ id: 'evt_1', type: 'memory.created', channel: 'opex', memoryIds: ['m_1'], at: '2026-11-01T00:00:00Z' }])
    expect(mocks.app).not.toHaveBeenCalled()
  })

  it('memory.consumed de vários canais da mesma leitura vira um engramind-consumption (atividade dos agentes)', async () => {
    await forwardWebhookLive(consumed('opex', ['m_1'], { title_ids: ['m_9'], context_version: 'cv_1' }))
    await forwardWebhookLive(consumed('agentes/desenvolvedor/global', ['m_2']))
    await vi.advanceTimersByTimeAsync(1000)
    expect(mocks.app).toHaveBeenCalledTimes(1)
    expect(mocks.app).toHaveBeenCalledWith('engramind-consumption', { agent: 'opex/desenvolvedor', kind: 'context', channels: ['opex', 'agentes/desenvolvedor/global'], delivered: ['opex', 'agentes/desenvolvedor/global'], memoryIds: ['m_1', 'm_2'], titleIds: ['m_9'], version: 'cv_1' })
  })

  it('leitura sem agente (token admin ou de app) não publica consumo', async () => {
    await forwardWebhookLive(consumed('opex', ['m_1'], { agent: null, consumption: 'cns_10' }))
    await vi.advanceTimersByTimeAsync(1000)
    expect(mocks.app).not.toHaveBeenCalled()
  })

  it('publishLive nunca lança e o payload do consumo não leva campos extras', async () => {
    await expect(publishLive({ type: 'channel.updated', channel: 'opex' })).resolves.toBeUndefined()
    expect(consumptionPayload({ agent: 'opex/opex', kind: 'search', channels: ['a'], delivered: ['a'], memoryIds: ['m'], consumption: 'cns_1', operation: 'search_memories' })).toEqual({ agent: 'opex/opex', kind: 'search', channels: ['a'], delivered: ['a'], memoryIds: ['m'] })
  })
})
