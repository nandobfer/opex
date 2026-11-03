import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ metrics: vi.fn(), history: vi.fn(), admin: vi.fn(async () => ({})) }))
vi.mock('@/features/auth/server/context', () => ({ requireAdminSession: mocks.admin }))
vi.mock('@/features/agent-metrics/server/metrics', () => ({ getAgentMetrics: mocks.metrics }))
vi.mock('@/features/agent-metrics/server/history', () => ({ getAgentHistory: mocks.history }))

import { GET as metricsGET } from '@/app/api/agents/[agent]/metrics/route'
import { GET as historyGET } from '@/app/api/agents/[agent]/history/route'

const metrics = (agent: string, query = '') => metricsGET(new NextRequest(`http://localhost/api/agents/${agent}/metrics${query}`), { params: Promise.resolve({ agent }) })
const history = (agent: string, query = '') => historyGET(new NextRequest(`http://localhost/api/agents/${agent}/history${query}`), { params: Promise.resolve({ agent }) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.metrics.mockResolvedValue({ agent: 'desenvolvedor' })
  mocks.history.mockResolvedValue({ items: [], page: 1, limit: 20, total: 0, totalPages: 1 })
})

describe('GET /api/agents/[agent]/metrics', () => {
  it('padrão de 30 dias; filtros em CSV chegam ao cálculo (só o dono)', async () => {
    const response = await metrics('desenvolvedor', '?clientes=c1,c2&repositorios=p1')
    expect(response.status).toBe(200)
    expect(mocks.admin).toHaveBeenCalled()
    expect(mocks.metrics).toHaveBeenCalledWith('desenvolvedor', expect.objectContaining({ periodo: '30d', clientes: ['c1', 'c2'], repositorios: ['p1'] }))
  })

  it('agente desconhecido responde 404 e período inválido 400, sem calcular', async () => {
    expect((await metrics('nada')).status).toBe(404)
    expect((await metrics('revisor', '?periodo=1ano')).status).toBe(400)
    expect((await metrics('revisor', '?periodo=custom&de=03/11/2026')).status).toBe(400)
    expect(mocks.metrics).not.toHaveBeenCalled()
  })
})

describe('GET /api/agents/[agent]/history', () => {
  it('paginado, com os mesmos filtros', async () => {
    const response = await history('orcamentista', '?page=2&limit=10&periodo=90d')
    expect(response.status).toBe(200)
    expect(mocks.history).toHaveBeenCalledWith('orcamentista', expect.objectContaining({ page: 2, limit: 10, periodo: '90d' }))
    expect((await history('orcamentista', '?limit=500')).status).toBe(400)
  })
})
