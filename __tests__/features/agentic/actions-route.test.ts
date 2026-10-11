import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ revisePlan: vi.fn(), implement: vi.fn(), reconnect: vi.fn() }))

vi.mock('@/features/agentic/server/workflow', () => ({
  revisePlan: mocks.revisePlan,
  implement: mocks.implement,
  reconnect: mocks.reconnect,
  requestCorrection: vi.fn(),
  submitPrFeedback: vi.fn(),
  reopen: vi.fn(),
  approve: vi.fn(),
  retry: vi.fn(),
  interrupt: vi.fn(),
}))

import { POST } from '@/app/api/agentic/workbenches/[id]/actions/[action]/route'

const call = (action: string, body?: unknown) =>
  POST(new NextRequest(`http://localhost/api/agentic/workbenches/w1/actions/${action}`, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }), { params: Promise.resolve({ id: 'w1', action }) })

beforeEach(() => vi.clearAllMocks())

describe('POST /api/agentic/workbenches/[id]/actions/[action]', () => {
  it('correção exige texto e vai para o planejador', async () => {
    mocks.revisePlan.mockResolvedValue({ id: 'w1' })
    expect((await call('revise-plan', { text: 'x' })).status).toBe(400)
    const res = await call('revise-plan', { text: 'Use o componente X' })
    expect(res.status).toBe(200)
    expect(mocks.revisePlan).toHaveBeenCalledWith('w1', 'Use o componente X')
  })

  it('implementar aceita texto opcional; ações sem corpo e ação desconhecida', async () => {
    mocks.implement.mockResolvedValue({ id: 'w1' })
    expect((await call('implement', {})).status).toBe(200)
    expect(mocks.implement).toHaveBeenCalledWith('w1', undefined)
    expect((await call('implement', { text: 'Use o componente X' })).status).toBe(200)
    expect(mocks.implement).toHaveBeenLastCalledWith('w1', 'Use o componente X')
    expect((await call('apagar-tudo')).status).toBe(404)
  })

  it('reconectar não tem corpo e devolve a mesa', async () => {
    mocks.reconnect.mockResolvedValue({ id: 'w1' })
    const res = await call('reconnect')
    expect(res.status).toBe(200)
    expect(mocks.reconnect).toHaveBeenCalledWith('w1')
  })
})
