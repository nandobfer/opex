import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => {
  class CronJobRunError extends Error {
    constructor(message: string, readonly status: 404 | 409) {
      super(message)
    }
  }
  return {
    CronJobRunError,
    runJobNow: vi.fn(),
    recordAudit: vi.fn(),
  }
})

vi.mock('@/lib/db', () => ({ recordAudit: mocks.recordAudit, AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR' } }))
vi.mock('@/features/integrations/scheduler/cron-scheduler', () => ({
  runJobNow: mocks.runJobNow,
  CronJobRunError: mocks.CronJobRunError,
}))
vi.mock('@/features/integrations/services/integration-service', () => ({ INTEGRATION_AUDIT_ENTITY: 'Integracao' }))
vi.mock('@/lib/logger', () => ({ logApiError: vi.fn(), logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { POST } from '@/app/api/integrations/[id]/jobs/[jobId]/run/route'

const call = (id = 'crons', jobId = 'cancel') =>
  POST(new NextRequest(`http://x/api/integrations/${id}/jobs/${jobId}/run`, { method: 'POST' }), {
    params: Promise.resolve({ id, jobId }),
  })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/integrations/crons/jobs/[jobId]/run — "Executar agora"', () => {
  it('executa e audita com o usuário local', async () => {
    mocks.runJobNow.mockResolvedValue({ ok: true, message: 'HTTP 200', durationMs: 42 })
    const res = await call()
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual({ ok: true, message: 'HTTP 200', durationMs: 42 })
    expect(mocks.runJobNow).toHaveBeenCalledWith('cancel')
    const audit = mocks.recordAudit.mock.calls[0][0]
    expect(audit).toMatchObject({ userId: 'local', entidade: 'Integracao', entidadeId: 'crons', acao: 'ATUALIZAR' })
    expect(audit.depois).toMatchObject({ execucaoManual: 'cancel', resultado: 'ok', duracaoMs: 42 })
  })

  it('rotina já em execução: 409 com a mensagem do agendador', async () => {
    mocks.runJobNow.mockRejectedValue(new mocks.CronJobRunError('A rotina "Cancelar" já está em execução.', 409))
    const res = await call()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/já está em execução/)
    expect(mocks.recordAudit).not.toHaveBeenCalled()
  })

  it('falha da rotina é auditada como erro e responde 200 com ok:false', async () => {
    mocks.runJobNow.mockResolvedValue({ ok: false, message: 'HTTP 500', durationMs: 10 })
    const res = await call()
    expect(res.status).toBe(200)
    expect(mocks.recordAudit.mock.calls[0][0].depois.resultado).toBe('erro')
  })

  it('outra integração: 404', async () => {
    expect((await call('pusher')).status).toBe(404)
    expect(mocks.runJobNow).not.toHaveBeenCalled()
  })
})
