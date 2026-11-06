import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { DEFAULT_UNIVERSE_LAYOUT } from '@engramind/client'

/** OPE-142: `/api/engramind/universe-layout` só para o dono; PUT valida com o schema da lib e DELETE volta ao padrão. */

const mocks = vi.hoisted(() => ({ admin: true, save: vi.fn(), reset: vi.fn(), get: vi.fn() }))
vi.mock('@/features/auth/server/context', async () => {
  const { DomainError } = await import('@/lib/api/route')
  return {
    requireAdminSession: vi.fn(async () => {
      if (!mocks.admin) throw new DomainError(401, 'Faça login.', 'UNAUTHORIZED')
      return { kind: 'admin' }
    }),
  }
})
vi.mock('@/features/engramind/server/universe-layout', () => ({ getUniverseLayout: mocks.get, saveUniverseLayout: mocks.save, resetUniverseLayout: mocks.reset }))

import { DELETE, GET, PUT } from '@/app/api/engramind/universe-layout/route'

const ctx = { params: Promise.resolve({}) } as never
const request = (method: string, body?: unknown) =>
  new NextRequest('http://opex.test/api/engramind/universe-layout', { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
const dto = { config: DEFAULT_UNIVERSE_LAYOUT, isDefault: true, updatedAt: null }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.admin = true
  mocks.get.mockResolvedValue(dto)
  mocks.reset.mockResolvedValue(dto)
  mocks.save.mockImplementation(async (config: unknown) => ({ config, isDefault: false, updatedAt: '2026-11-06T12:00:00.000Z' }))
})

describe('/api/engramind/universe-layout', () => {
  it('sem sessão do dono: 401 nos três métodos', async () => {
    mocks.admin = false
    for (const [handler, method] of [[GET, 'GET'], [PUT, 'PUT'], [DELETE, 'DELETE']] as const) expect((await handler(request(method, method === 'PUT' ? {} : undefined), ctx)).status).toBe(401)
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('GET devolve a configuração em uso', async () => {
    const res = await GET(request('GET'), ctx)
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual(dto)
  })

  it('PUT valida o corpo com o schema da lib e grava a configuração completa', async () => {
    const res = await PUT(request('PUT', { layout: 'spiral', ringGap: 80 }), ctx)
    expect(res.status).toBe(200)
    expect(mocks.save).toHaveBeenCalledWith({ ...DEFAULT_UNIVERSE_LAYOUT, layout: 'spiral', ringGap: 80 }, 'local')
  })

  it('PUT recusa valor fora do intervalo e campo desconhecido com 400, sem gravar', async () => {
    expect((await PUT(request('PUT', { slot: 1 }), ctx)).status).toBe(400)
    expect((await PUT(request('PUT', { cor: 'azul' }), ctx)).status).toBe(400)
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('DELETE volta ao padrão', async () => {
    const res = await DELETE(request('DELETE'), ctx)
    expect(res.status).toBe(200)
    expect(mocks.reset).toHaveBeenCalledWith('local')
  })
})
