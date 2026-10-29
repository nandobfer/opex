import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ revisePlan: vi.fn(), implement: vi.fn(), reconnect: vi.fn(), cancelWait: vi.fn(), adversarialFix: vi.fn(), adversarialSkip: vi.fn(), adversarialRerun: vi.fn(), setWorkbenchStage: vi.fn() }))

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
  cancelWait: mocks.cancelWait,
  adversarialFix: mocks.adversarialFix,
  adversarialSkip: mocks.adversarialSkip,
  adversarialRerun: mocks.adversarialRerun,
  setWorkbenchStage: mocks.setWorkbenchStage,
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
    expect(mocks.revisePlan).toHaveBeenCalledWith('w1', 'Use o componente X', undefined)
  })

  it('implementar aceita texto opcional; ações sem corpo e ação desconhecida', async () => {
    mocks.implement.mockResolvedValue({ id: 'w1' })
    expect((await call('implement', {})).status).toBe(200)
    expect(mocks.implement).toHaveBeenCalledWith('w1', undefined, undefined)
    expect((await call('implement', { text: 'Use o componente X' })).status).toBe(200)
    expect(mocks.implement).toHaveBeenLastCalledWith('w1', 'Use o componente X', undefined)
    expect((await call('apagar-tudo')).status).toBe(404)
  })

  it('reconectar não tem corpo e devolve a mesa', async () => {
    mocks.reconnect.mockResolvedValue({ id: 'w1' })
    const res = await call('reconnect')
    expect(res.status).toBe(200)
    expect(mocks.reconnect).toHaveBeenCalledWith('w1')
  })

  it('Agente Adversário: corrigir aceita texto e achados desmarcados; seguir e revisar de novo não têm corpo', async () => {
    mocks.adversarialFix.mockResolvedValue({ id: 'w1' })
    mocks.adversarialSkip.mockResolvedValue({ id: 'w1' })
    mocks.adversarialRerun.mockResolvedValue({ id: 'w1' })
    expect((await call('adversarial-fix', { text: 'F2 é intencional', excluded: ['F2'] })).status).toBe(200)
    expect(mocks.adversarialFix).toHaveBeenCalledWith('w1', { text: 'F2 é intencional', excluded: ['F2'] })
    expect((await call('adversarial-fix', { excluded: 'F2' })).status).toBe(400)
    expect((await call('adversarial-skip')).status).toBe(200)
    expect(mocks.adversarialSkip).toHaveBeenCalledWith('w1')
    expect((await call('adversarial-rerun')).status).toBe(200)
    expect(mocks.adversarialRerun).toHaveBeenCalledWith('w1')
  })

  it('definir etapa exige uma etapa de espera e o motivo', async () => {
    mocks.setWorkbenchStage.mockResolvedValue({ id: 'w1', stage: 'done' })
    expect((await call('set-stage', { stage: 'done' })).status).toBe(400)
    expect((await call('set-stage', { stage: 'implementing', reason: 'Implementar' })).status).toBe(400)
    expect(mocks.setWorkbenchStage).not.toHaveBeenCalled()
    const res = await call('set-stage', { stage: 'done', reason: ' Já resolvido ' })
    expect(res.status).toBe(200)
    expect(mocks.setWorkbenchStage).toHaveBeenCalledWith('w1', { stage: 'done', reason: 'Já resolvido' })
  })

  it('cancelar a espera por vaga não tem corpo e devolve a mesa', async () => {
    mocks.cancelWait.mockResolvedValue({ id: 'w1', slotQueue: null })
    const res = await call('cancel-wait')
    expect(res.status).toBe(200)
    expect(mocks.cancelWait).toHaveBeenCalledWith('w1')
  })
})
