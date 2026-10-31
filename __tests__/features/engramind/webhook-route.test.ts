import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Rota pública do webhook: 204 com assinatura válida, 401 sem corpo nos demais, repetido sem republicar. */

const mocks = vi.hoisted(() => ({
  config: {} as Record<string, string | undefined>,
  seen: new Set<string>(),
  publish: vi.fn(async () => {}),
  after: [] as Promise<unknown>[],
}))

vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: async () => mocks.config }))
vi.mock('@/lib/after-response', () => ({
  runAfterResponse: (_label: string, task: () => Promise<unknown>) => {
    mocks.after.push(task())
  },
}))
vi.mock('@/features/engramind/server/models', () => ({
  engramindDb: async () => {},
  EngramindWebhookEvent: {
    create: async ({ _id }: { _id: string }) => {
      if (mocks.seen.has(_id)) throw Object.assign(new Error('dup'), { code: 11000 })
      mocks.seen.add(_id)
    },
  },
}))
vi.mock('@/features/engramind/server/shared', () => ({ engramindLog: { info: vi.fn(), warn: vi.fn() }, publishEngramind: mocks.publish }))

import { POST } from '@/app/api/engramind/webhook/route'
import { signPayload } from '@/features/engramind/server/webhook'
import type { NextRequest } from 'next/server'

const SECRET = 'segredo-do-webhook-com-mais-de-32-caracteres'
const body = JSON.stringify({ id: 'evt_1', type: 'channel.updated', channel: 'eng/global', at: '2026-10-31T12:00:00Z' })
const now = () => Math.floor(Date.now() / 1000)
const request = (raw: string, signature?: string) =>
  new Request('http://opex/api/engramind/webhook', { method: 'POST', body: raw, headers: signature ? { 'Engramind-Signature': signature, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' } }) as unknown as NextRequest
const signed = (raw = body, t = now(), secret = SECRET) => `t=${t},v1=${signPayload(secret, t, raw)}`
const flush = async () => {
  await Promise.all(mocks.after.splice(0))
}

describe('POST /api/engramind/webhook', () => {
  beforeEach(() => {
    mocks.config = { webhookSecret: SECRET }
    mocks.seen.clear()
    mocks.publish.mockClear()
    mocks.after = []
  })

  it('assinatura válida: 204 e repasse às telas; o mesmo id de novo responde 204 sem republicar', async () => {
    const first = await POST(request(body, signed()))
    expect(first.status).toBe(204)
    await flush()
    expect(mocks.publish).toHaveBeenCalledWith({ type: 'channel.updated', channel: 'eng/global', keys: undefined })
    const again = await POST(request(body, signed()))
    expect(again.status).toBe(204)
    await flush()
    expect(mocks.publish).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['assinatura de outro segredo', () => request(body, signed(body, now(), 'outro-segredo-qualquer-com-32-caracteres'))],
    ['corpo alterado', () => request(`${body} `, signed())],
    ['janela vencida', () => request(body, signed(body, now() - 301))],
    ['sem cabeçalho', () => request(body)],
  ])('%s: 401 sem corpo e sem repasse', async (_name, make) => {
    const response = await POST(make())
    expect(response.status).toBe(401)
    expect(await response.text()).toBe('')
    await flush()
    expect(mocks.publish).not.toHaveBeenCalled()
  })

  it('sem segredo configurado: 401', async () => {
    mocks.config = {}
    const response = await POST(request(body, signed()))
    expect(response.status).toBe(401)
    expect(await response.text()).toBe('')
  })
})
