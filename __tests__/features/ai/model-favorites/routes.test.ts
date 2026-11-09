import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ list: vi.fn(), add: vi.fn(), remove: vi.fn() }))

vi.mock('@/features/ai/model-favorites/server/service', () => ({ listModelFavorites: mocks.list, addModelFavorite: mocks.add, removeModelFavorite: mocks.remove }))

import { DELETE, GET, POST } from '@/app/api/ai/model-favorites/route'

const ctx = { params: Promise.resolve({}) }
const req = (method: string, body?: unknown) => new NextRequest('http://localhost/api/ai/model-favorites', body === undefined ? { method } : { method, body: JSON.stringify(body) })

beforeEach(() => vi.clearAllMocks())

describe('rotas dos modelos favoritos', () => {
  it('GET lista os favoritos do usuário local', async () => {
    mocks.list.mockResolvedValue({ favorites: [{ provider: 'gemini', model: 'flash' }] })
    const res = await GET(req('GET'), ctx)
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({ favorites: [{ provider: 'gemini', model: 'flash' }] })
    expect(mocks.list).toHaveBeenCalledWith('local')
  })

  it('POST favorita com o corpo validado; repetir devolve 200 (idempotente)', async () => {
    mocks.add.mockResolvedValue({ favorites: [{ provider: 'opencode', model: 'openrouter/x:free' }] })
    const body = { provider: 'opencode', model: ' openrouter/x:free ' }
    expect((await POST(req('POST', body), ctx)).status).toBe(200)
    expect((await POST(req('POST', body), ctx)).status).toBe(200)
    expect(mocks.add).toHaveBeenCalledWith({ provider: 'opencode', model: 'openrouter/x:free' }, 'local')
  })

  it('DELETE remove pelo corpo; favorito inexistente também devolve 200', async () => {
    mocks.remove.mockResolvedValue({ favorites: [] })
    const res = await DELETE(req('DELETE', { provider: 'local', model: 'BAAI/bge-small-en-v1.5' }), ctx)
    expect(res.status).toBe(200)
    expect(mocks.remove).toHaveBeenCalledWith({ provider: 'local', model: 'BAAI/bge-small-en-v1.5' }, 'local')
  })

  it('rejeita provedor desconhecido ou modelo vazio', async () => {
    expect((await POST(req('POST', { provider: 'xpto', model: 'flash' }), ctx)).status).toBe(400)
    expect((await DELETE(req('DELETE', { provider: 'gemini', model: '  ' }), ctx)).status).toBe(400)
    expect(mocks.add).not.toHaveBeenCalled()
    expect(mocks.remove).not.toHaveBeenCalled()
  })
})
