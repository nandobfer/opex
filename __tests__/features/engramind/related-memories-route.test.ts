import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/** OPE-164: `GET /api/engramind/related-memories` só para o dono. */

const mocks = vi.hoisted(() => ({ admin: true, get: vi.fn() }))
vi.mock('@/features/auth/server/context', async () => {
  const { DomainError } = await import('@/lib/api/route')
  return {
    requireAdminSession: vi.fn(async () => {
      if (!mocks.admin) throw new DomainError(401, 'Faça login.', 'UNAUTHORIZED')
      return { kind: 'admin' }
    }),
  }
})
vi.mock('@/features/engramind/server/related-memories', () => ({ getRelatedMemories: mocks.get }))

import { GET } from '@/app/api/engramind/related-memories/route'

const ctx = { params: Promise.resolve({}) } as never
const request = () => new NextRequest('http://opex.test/api/engramind/related-memories')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.admin = true
  mocks.get.mockResolvedValue({ related: { m_1: [{ id: 'm_2', score: 0.9 }] }, pending: false, ready: true })
})

describe('/api/engramind/related-memories', () => {
  it('sem sessão do dono: 401, sem consultar o cache', async () => {
    mocks.admin = false
    expect((await GET(request(), ctx)).status).toBe(401)
    expect(mocks.get).not.toHaveBeenCalled()
  })

  it('devolve as similares guardadas', async () => {
    const res = await GET(request(), ctx)
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({ related: { m_1: [{ id: 'm_2', score: 0.9 }] }, pending: false, ready: true })
  })
})
