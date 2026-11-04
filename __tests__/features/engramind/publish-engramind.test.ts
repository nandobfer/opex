import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LiveEvent } from '@engramind/client'

/**
 * OPE-116: as mutações do próprio Opex chegam à rede pelo SSE (`publishEngramind` publica no Pusher e no
 * barramento). O webhook passa `{ live: false }` porque já publicou no SSE (sem evento duplicado).
 */

const mocks = vi.hoisted(() => ({ app: vi.fn(async () => {}) }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: mocks.app }))

import { publishEngramind } from '@/features/engramind/server/shared'
import { engramindBus } from '@/features/engramind/server/live'

let got: LiveEvent[] = []
beforeEach(() => {
  mocks.app.mockClear()
  got = []
})

const listen = () => engramindBus().subscribe((event) => got.push(event))

describe('publishEngramind', () => {
  it('por padrão publica engramind-updated no Pusher e o mesmo evento no SSE da rede', async () => {
    const off = listen()
    await publishEngramind({ type: 'settings.updated', channel: null, keys: ['limits.max_batch'] })
    await publishEngramind({ type: 'channel.updated', channel: 'eng/global' })
    off()
    expect(mocks.app).toHaveBeenCalledWith('engramind-updated', { type: 'settings.updated', keys: ['limits.max_batch'] })
    expect(mocks.app).toHaveBeenCalledWith('engramind-updated', { type: 'channel.updated', channel: 'eng/global' })
    expect(got).toEqual([
      { type: 'settings.updated', channel: null, keys: ['limits.max_batch'] },
      { type: 'channel.updated', channel: 'eng/global' },
    ].map((event) => expect.objectContaining(event)))
  })

  it('com { live: false } (webhook) publica só no Pusher', async () => {
    const off = listen()
    await publishEngramind({ type: 'memory.created', channel: 'eng/global' }, { live: false })
    off()
    expect(mocks.app).toHaveBeenCalledTimes(1)
    expect(got).toEqual([])
  })
})
