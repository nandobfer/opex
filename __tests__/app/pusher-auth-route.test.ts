import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST /api/pusher/auth com a autorização assíncrona (OPE-212): o canal de um provedor de IA customizado
 * (`private-integration-ai_custom_<slug>`) é resolvido pelo runtime REAL da central (`getDefinition` →
 * filhos dinâmicos do hub de IA → coleção `ai_custom_providers`, simulada só no modelo). A rota tem que
 * esperar a decisão: sem o `await`, a Promise seria verdadeira e qualquer sessão seria autorizada.
 */

const mocks = vi.hoisted(() => {
  // Sem o modo "memória" do setup: o hub de IA carrega os provedores customizados gravados.
  process.env.OPEX_INTEGRATIONS_STORE = 'database'
  return {
    session: { current: null as null | Record<string, unknown> },
    authorizeChannel: vi.fn((socketId: string, channel: string) => ({ auth: `ok:${socketId}:${channel}` })),
    providers: [{ slug: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', manualModels: [], createdAt: new Date(), updatedAt: new Date() }],
  }
})

vi.mock('@/lib/db', () => ({ dbConnect: vi.fn(async () => undefined) }))
vi.mock('@/lib/pusher/server', () => ({ getPusherServer: vi.fn(async () => ({ authorizeChannel: mocks.authorizeChannel })) }))
vi.mock('@/features/auth/server/context', () => ({ sessionFromRequest: vi.fn(async () => mocks.session.current) }))
vi.mock('@nandobfer/integracoes/modules/integrations/ia/custom/model', () => ({
  AiCustomProvider: { find: () => ({ sort: () => ({ lean: async () => mocks.providers }) }) },
}))

import { POST } from '@/app/api/pusher/auth/route'

const ADMIN = { iat: 0, exp: 9_999_999_999, kind: 'admin' }
const CLIENT = { iat: 0, exp: 9_999_999_999, kind: 'client', userId: 'u1', clientId: 'c1' }

const post = (channel: string) =>
  POST(new NextRequest('http://localhost/api/pusher/auth', { method: 'POST', body: new URLSearchParams({ socket_id: '1.2', channel_name: channel }).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } }))

beforeEach(() => {
  mocks.authorizeChannel.mockClear()
  mocks.session.current = ADMIN
})

describe('POST /api/pusher/auth — canal de provedor customizado', () => {
  it('o dono assina o canal de um provedor customizado que existe', async () => {
    const res = await post('private-integration-ai_custom_groq')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ auth: 'ok:1.2:private-integration-ai_custom_groq' })
  })

  it('provedor customizado inexistente recebe 403 e não é autorizado no Pusher', async () => {
    const res = await post('private-integration-ai_custom_sumiu')
    expect(res.status).toBe(403)
    expect(mocks.authorizeChannel).not.toHaveBeenCalled()
  })

  it('sessão de cliente ou sem sessão recebe 403 mesmo para o provedor que existe', async () => {
    mocks.session.current = CLIENT
    expect((await post('private-integration-ai_custom_groq')).status).toBe(403)
    mocks.session.current = null
    expect((await post('private-integration-ai_custom_groq')).status).toBe(403)
    expect(mocks.authorizeChannel).not.toHaveBeenCalled()
  })
})
