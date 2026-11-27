import { legacyRoute } from '../../helpers/integrations-route'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), select: vi.fn(), primary: vi.fn() }))
vi.mock("@nandobfer/integracoes/modules/integrations/ia/features/ai/server/api-keys", async (importOriginal) => ({
  keyRingProvider: (await importOriginal<typeof import('@nandobfer/integracoes/modules/integrations/ia/features/ai/server/api-keys')>()).keyRingProvider,
  listAiApiKeys: mocks.list,
  createAiApiKey: mocks.create,
  updateAiApiKey: mocks.update,
  removeAiApiKey: mocks.remove,
  setAiApiKeySelected: mocks.select,
  makePrimaryAiApiKey: mocks.primary,
}))

const { GET, POST } = legacyRoute("ai", "providers/[provider]/keys")
const { DELETE, PATCH } = legacyRoute("ai", "providers/[provider]/keys/[keyId]")
const { POST: PRIMARY } = legacyRoute("ai", "providers/[provider]/keys/[keyId]/primary")
const { PATCH: SELECTION } = legacyRoute("ai", "providers/[provider]/keys/[keyId]/selection")

const url = (path: string) => `http://localhost/api/ai/providers/${path}`
const json = (path: string, method: string, body: unknown) => new NextRequest(url(path), { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
const keys = [{ id: 'key_aaaaaaaaaaaaaaaaaa', name: 'Pessoal', active: true, primary: true, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' }]

beforeEach(() => {
  vi.clearAllMocks()
  for (const fn of Object.values(mocks)) fn.mockResolvedValue(keys)
})

describe('rotas do chaveiro dos provedores de IA (OPE-155)', () => {
  it('lista e cria chaves dos provedores por API key, inclusive o JEV', async () => {
    const list = await GET(new NextRequest(url('jev/keys')), { params: Promise.resolve({ provider: 'jev' }) })
    expect(await list.json()).toMatchObject({ success: true, data: keys })
    const created = await POST(json('gemini/keys', 'POST', { name: 'Pessoal', secret: 'gm' }), { params: Promise.resolve({ provider: 'gemini' }) })
    expect(created.status).toBe(200)
    expect(mocks.create).toHaveBeenCalledWith('gemini', { name: 'Pessoal', secret: 'gm' }, 'local')
  })

  it('OpenCode Go (OPE-156) também tem chaveiro: lista e cria pelas mesmas rotas', async () => {
    const list = await GET(new NextRequest(url('opencode-go/keys')), { params: Promise.resolve({ provider: 'opencode-go' }) })
    expect(list.status).toBe(200)
    expect(mocks.list).toHaveBeenCalledWith('opencode-go')
    const created = await POST(json('opencode-go/keys', 'POST', { name: 'Assinatura', secret: 'oc_sk_x' }), { params: Promise.resolve({ provider: 'opencode-go' }) })
    expect(created.status).toBe(200)
    expect(mocks.create).toHaveBeenCalledWith('opencode-go', { name: 'Assinatura', secret: 'oc_sk_x' }, 'local')
  })

  it('OpenCode e provedor desconhecido respondem 404; corpo inválido responde 400 sem gravar', async () => {
    expect((await GET(new NextRequest(url('opencode/keys')), { params: Promise.resolve({ provider: 'opencode' }) })).status).toBe(404)
    expect((await POST(json('x/keys', 'POST', { name: 'a', secret: 'b' }), { params: Promise.resolve({ provider: 'x' }) })).status).toBe(404)
    expect((await POST(json('gemini/keys', 'POST', { name: '', secret: 'b' }), { params: Promise.resolve({ provider: 'gemini' }) })).status).toBe(400)
    expect((await PATCH(json('gemini/keys/k', 'PATCH', {}), { params: Promise.resolve({ provider: 'gemini', keyId: 'k' }) })).status).toBe(400)
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('põe e tira de uso (OPE-179): corpo validado; provedor sem chaveiro responde 404', async () => {
    const params = { params: Promise.resolve({ provider: 'deepseek', keyId: 'key_aaaaaaaaaaaaaaaaaa' }) }
    expect((await SELECTION(json('deepseek/keys/key_aaaaaaaaaaaaaaaaaa/selection', 'PATCH', { selected: true }), params)).status).toBe(200)
    expect(mocks.select).toHaveBeenCalledWith('deepseek', 'key_aaaaaaaaaaaaaaaaaa', { selected: true }, 'local')
    expect((await SELECTION(json('deepseek/keys/k/selection', 'PATCH', { selected: 'sim' }), { params: Promise.resolve({ provider: 'deepseek', keyId: 'k' }) })).status).toBe(400)
    expect((await SELECTION(json('opencode/keys/k/selection', 'PATCH', { selected: true }), { params: Promise.resolve({ provider: 'opencode', keyId: 'k' }) })).status).toBe(404)
    expect(mocks.select).toHaveBeenCalledOnce()
  })

  it('renomeia/substitui, remove e torna principal', async () => {
    const params = { params: Promise.resolve({ provider: 'openai', keyId: 'key_aaaaaaaaaaaaaaaaaa' }) }
    expect((await PATCH(json('openai/keys/key_aaaaaaaaaaaaaaaaaa', 'PATCH', { secret: 'sk' }), params)).status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith('openai', 'key_aaaaaaaaaaaaaaaaaa', { secret: 'sk' }, 'local')
    expect((await DELETE(new NextRequest(url('openai/keys/key_aaaaaaaaaaaaaaaaaa'), { method: 'DELETE' }), { params: Promise.resolve({ provider: 'openai', keyId: 'key_aaaaaaaaaaaaaaaaaa' }) })).status).toBe(200)
    expect((await PRIMARY(new NextRequest(url('openai/keys/key_aaaaaaaaaaaaaaaaaa/primary'), { method: 'POST' }), { params: Promise.resolve({ provider: 'openai', keyId: 'key_aaaaaaaaaaaaaaaaaa' }) })).status).toBe(200)
    expect(mocks.primary).toHaveBeenCalledWith('openai', 'key_aaaaaaaaaaaaaaaaaa', 'local')
  })
})
