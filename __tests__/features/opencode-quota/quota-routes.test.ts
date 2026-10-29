import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ get: vi.fn(), refresh: vi.fn(), config: vi.fn() }))

vi.mock('@/features/opencode-quota/server/service', () => ({ getOpencodeQuota: mocks.get, refreshOpencodeQuota: mocks.refresh }))
vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: mocks.config }))

import { GET } from '@/app/api/opencode/quota/route'
import { POST } from '@/app/api/opencode/quota/refresh/route'

const params = { params: Promise.resolve({}) }
const dto = { state: 'missing', message: 'x', exportedAt: null, checkedAt: '2026-10-28T12:00:00.000Z', providers: [] }

beforeEach(() => vi.clearAllMocks())

describe('rotas da quota do OpenCode', () => {
  it('GET devolve o último resultado', async () => {
    mocks.get.mockResolvedValue(dto)
    const res = await GET(new NextRequest('http://localhost/api/opencode/quota'), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, data: dto })
  })

  it('POST refresh usa o motivo da integração (padrão manual)', async () => {
    mocks.refresh.mockResolvedValue(dto)
    mocks.config.mockResolvedValue({ baseUrl: 'http://opencode:4999' })
    const res = await POST(new NextRequest('http://localhost/api/opencode/quota/refresh', { method: 'POST' }), params)
    expect(res.status).toBe(200)
    expect(mocks.config).toHaveBeenCalledWith('ai_opencode')
    expect(mocks.refresh).toHaveBeenCalledWith({ reason: 'manual' })

    mocks.config.mockResolvedValue({ baseUrl: 'http://opencode:4999', quotaRefreshReason: 'poll' })
    await POST(new NextRequest('http://localhost/api/opencode/quota/refresh', { method: 'POST' }), params)
    expect(mocks.refresh).toHaveBeenLastCalledWith({ reason: 'poll' })
  })
})
