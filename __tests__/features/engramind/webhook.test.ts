import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Webhook do Engramind: assinatura HMAC, janela de 5 min, id repetido descartado e repasse mínimo. */

const mocks = vi.hoisted(() => ({
  config: { webhookSecret: 'segredo-do-webhook-com-mais-de-32-caracteres' } as Record<string, string | undefined>,
  seen: new Set<string>(),
  publish: vi.fn(async () => {}),
}))

vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: async () => mocks.config }))
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

import { authenticateWebhook, processWebhookEvent, signPayload, verifySignature } from '@/features/engramind/server/webhook'

const SECRET = 'segredo-do-webhook-com-mais-de-32-caracteres'
const body = JSON.stringify({ id: 'evt_1', type: 'memory.created', channel: 'eng/global', channel_version: 4, memory_ids: ['m_1'], at: '2026-10-31T12:00:00Z' })
const now = 1_793_370_000
const header = (t: number, raw = body, secret = SECRET) => `t=${t},v1=${signPayload(secret, t, raw)}`

describe('verifySignature', () => {
  it('aceita a assinatura do corpo bruto dentro da janela', () => {
    expect(verifySignature(body, header(now), SECRET, now)).toEqual({ ok: true })
    expect(verifySignature(body, header(now - 299), SECRET, now)).toEqual({ ok: true })
  })

  it('recusa corpo alterado, outro segredo, fora da janela, malformado e ausente', () => {
    expect(verifySignature(`${body} `, header(now), SECRET, now)).toEqual({ ok: false, reason: 'mismatch' })
    expect(verifySignature(body, header(now, body, 'outro-segredo-qualquer-com-32-caracteres'), SECRET, now)).toEqual({ ok: false, reason: 'mismatch' })
    expect(verifySignature(body, header(now - 301), SECRET, now)).toEqual({ ok: false, reason: 'expired' })
    expect(verifySignature(body, 't=abc,v1=zz', SECRET, now)).toEqual({ ok: false, reason: 'malformed' })
    expect(verifySignature(body, null, SECRET, now)).toEqual({ ok: false, reason: 'missing' })
  })
})

describe('processamento', () => {
  beforeEach(() => {
    mocks.seen.clear()
    mocks.publish.mockClear()
    mocks.config = { webhookSecret: SECRET }
  })

  it('sem segredo configurado, recusa', async () => {
    mocks.config = {}
    expect(await authenticateWebhook(body, header(Math.floor(Date.now() / 1000)))).toMatchObject({ ok: false })
  })

  it('assinatura válida autentica; o repasse publica só ids e tipo; repetido é descartado', async () => {
    const auth = await authenticateWebhook(body, header(Math.floor(Date.now() / 1000)))
    expect(auth.ok).toBe(true)
    if (!auth.ok) return
    expect(await processWebhookEvent(auth.event)).toBe(true)
    expect(mocks.publish).toHaveBeenCalledWith({ type: 'memory.created', channel: 'eng/global', keys: undefined })
    expect(await processWebhookEvent(auth.event)).toBe(false)
    expect(mocks.publish).toHaveBeenCalledTimes(1)
  })

  it('settings.updated repassa as chaves alteradas', async () => {
    await processWebhookEvent({ id: 'evt_2', type: 'settings.updated', channel: null, keys: ['limits.max_batch'], at: '2026-10-31T12:00:00Z' })
    expect(mocks.publish).toHaveBeenCalledWith({ type: 'settings.updated', channel: null, keys: ['limits.max_batch'] })
  })
})
