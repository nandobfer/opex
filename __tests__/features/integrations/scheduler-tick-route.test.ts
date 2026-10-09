import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getIntegrationConfig: vi.fn(),
  registerBuiltInJobs: vi.fn(),
  runSchedulerTick: vi.fn(),
}))

vi.mock('@/lib/integrations/config', () => ({ getIntegrationConfig: mocks.getIntegrationConfig }))
vi.mock('@/features/integrations/scheduler/cron-scheduler', () => ({
  registerBuiltInJobs: mocks.registerBuiltInJobs,
  runSchedulerTick: mocks.runSchedulerTick,
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { GET, POST } from '@/app/api/routines/scheduler-tick/route'

function tickRequest(token?: string, method = 'GET') {
  return new NextRequest('http://localhost:3100/api/routines/scheduler-tick', {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('CRON_SECRET', 'segredo-env')
  mocks.getIntegrationConfig.mockResolvedValue({ cronSecret: 'segredo-banco' })
  mocks.runSchedulerTick.mockResolvedValue({ executed: ['cancel'] })
})

afterEach(() => vi.unstubAllEnvs())

describe('GET/POST /api/routines/scheduler-tick (tick externo)', () => {
  it('recusa sem token ou com token errado, sem rodar o tick', async () => {
    for (const res of [await GET(tickRequest()), await GET(tickRequest('errado'))]) {
      expect(res.status).toBe(401)
      expect((await res.json()).error).toBe('Não autorizado')
    }
    expect(mocks.runSchedulerTick).not.toHaveBeenCalled()
  })

  it('aceita o CRON_SECRET do ambiente mesmo divergente do banco', async () => {
    const res = await GET(tickRequest('segredo-env'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, executed: ['cancel'] })
    expect(mocks.registerBuiltInJobs).toHaveBeenCalled()
  })

  it('aceita o cron secret da integração (banco) via POST', async () => {
    const res = await POST(tickRequest('segredo-banco', 'POST'))
    expect(res.status).toBe(200)
  })

  it('sem CRON_SECRET no ambiente, só o segredo do banco autentica', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await GET(tickRequest('segredo-env'))).status).toBe(401)
    expect((await GET(tickRequest('segredo-banco'))).status).toBe(200)
  })

  it('agendador desligado: devolve skipped', async () => {
    mocks.runSchedulerTick.mockResolvedValue({ skipped: 'disabled', executed: [] })
    const body = await (await GET(tickRequest('segredo-env'))).json()
    expect(body).toEqual({ success: true, executed: [], skipped: 'disabled' })
  })

  it('falha no tick responde 500 com mensagem em pt-BR', async () => {
    mocks.runSchedulerTick.mockRejectedValue(new Error('boom'))
    const res = await GET(tickRequest('segredo-env'))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('Erro ao executar o tick do agendador')
  })
})
