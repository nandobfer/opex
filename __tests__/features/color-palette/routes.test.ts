import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ update: vi.fn(), remove: vi.fn() }))

vi.mock('@/features/color-palette/server/service', () => ({ updateFavoriteColor: mocks.update, removeFavoriteColor: mocks.remove }))

import { DELETE, PATCH } from '@/app/api/color-palette/favorites/[hex]/route'

const params = (hex: string) => ({ params: Promise.resolve({ hex }) })
const req = (method: string, body?: unknown) => new NextRequest('http://localhost/api/color-palette/favorites/x', body === undefined ? { method } : { method, body: JSON.stringify(body) })

beforeEach(() => vi.clearAllMocks())

describe('rotas das cores favoritas', () => {
  it('PATCH edita a favorita do caminho com o corpo validado', async () => {
    mocks.update.mockResolvedValue({ favorites: [{ color: '#8000FF', name: 'Roxo' }] })
    const res = await PATCH(req('PATCH', { color: '#8000ff', name: ' Roxo ' }), params('a78bfa'))
    expect(res.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith('#A78BFA', { color: '#8000FF', name: 'Roxo' }, 'local')
  })

  it('PATCH rejeita hex inválido no caminho e no corpo', async () => {
    expect((await PATCH(req('PATCH', { color: '#8000FF' }), params('xyz'))).status).toBe(400)
    expect((await PATCH(req('PATCH', { color: 'roxo' }), params('A78BFA'))).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('DELETE remove pelo hex do caminho', async () => {
    mocks.remove.mockResolvedValue({ favorites: [] })
    expect((await DELETE(req('DELETE'), params('A78BFA'))).status).toBe(200)
    expect(mocks.remove).toHaveBeenCalledWith('#A78BFA', 'local')
  })
})
