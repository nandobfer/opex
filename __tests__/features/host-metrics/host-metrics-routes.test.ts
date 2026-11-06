import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ get: vi.fn(), refresh: vi.fn() }))

vi.mock('@/features/host-metrics/server/service', () => ({ getHostMetrics: mocks.get, refreshHostMetrics: mocks.refresh }))

import { GET } from '@/app/api/host-metrics/route'
import { POST } from '@/app/api/host-metrics/refresh/route'

const params = { params: Promise.resolve({}) }
const dto = { state: 'unconfigured', message: 'x', metrics: null, checkedAt: null, attemptedAt: '2026-11-06T12:00:00.000Z', staleAfterMs: 30_000 }

beforeEach(() => vi.clearAllMocks())

describe('rotas dos recursos do servidor (OPE-145)', () => {
  it('GET devolve o último resultado em memória', async () => {
    mocks.get.mockResolvedValue(dto)
    const res = await GET(new NextRequest('http://localhost/api/host-metrics'), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, data: dto })
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('POST refresh lê na hora', async () => {
    mocks.refresh.mockResolvedValue(dto)
    const res = await POST(new NextRequest('http://localhost/api/host-metrics/refresh', { method: 'POST' }), params)
    expect(res.status).toBe(200)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })
})
