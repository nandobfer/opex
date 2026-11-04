import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/** OPE-116: `GET /api/engramind/events` (SSE da rede) só para o dono e repassa o evento do barramento. */

const mocks = vi.hoisted(() => ({ admin: true }))
vi.mock('@/features/auth/server/context', async () => {
  const { DomainError } = await import('@/lib/api/route')
  return {
    requireAdminSession: vi.fn(async () => {
      if (!mocks.admin) throw new DomainError(401, 'Faça login.', 'UNAUTHORIZED')
      return { kind: 'admin' }
    }),
  }
})
vi.mock('@/features/engramind/server/shared', () => ({ engramindLog: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))

import { GET } from '@/app/api/engramind/events/route'
import { engramindBus } from '@/features/engramind/server/live'

const read = async (reader: ReadableStreamDefaultReader<Uint8Array>, needle: string) => {
  const decoder = new TextDecoder()
  let text = ''
  while (!text.includes(needle)) {
    const { value, done } = await reader.read()
    if (done) break
    text += decoder.decode(value)
  }
  return text
}

beforeEach(() => {
  mocks.admin = true
})

describe('GET /api/engramind/events', () => {
  it('sem sessão do dono: 401, sem abrir o SSE', async () => {
    mocks.admin = false
    const res = await GET(new NextRequest('http://opex.test/api/engramind/events'), { params: Promise.resolve({}) } as never)
    expect(res.status).toBe(401)
    expect(engramindBus().size).toBe(0)
  })

  it('o dono recebe o evento do barramento como `event: engramind`', async () => {
    const controller = new AbortController()
    const res = await GET(new NextRequest('http://opex.test/api/engramind/events', { signal: controller.signal }), { params: Promise.resolve({}) } as never)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const reader = res.body!.getReader()
    await read(reader, 'event: ready')
    await engramindBus().publish({ type: 'memory.consumed', channel: 'opex', memoryIds: ['m_1'], consumption: 'cns_1', agent: 'opex/opex' })
    expect(await read(reader, 'm_1')).toContain('event: engramind\ndata: {"type":"memory.consumed","channel":"opex","memoryIds":["m_1"],"consumption":"cns_1","agent":"opex/opex"}')
    controller.abort()
    expect(engramindBus().size).toBe(0)
  })
})
