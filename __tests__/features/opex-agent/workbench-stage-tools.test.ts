import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Ferramentas do Agente Opex para concluir a mesa sem PR e definir a etapa (MT-22). */

const mocks = vi.hoisted(() => ({ setWorkbenchStage: vi.fn(), getWorkbench: vi.fn() }))

vi.mock('ai', () => ({ dynamicTool: (def: unknown) => def }))
vi.mock('@/features/agentic/server/workflow', async (original) => ({ ...(await original<object>()), setWorkbenchStage: mocks.setWorkbenchStage, getWorkbench: mocks.getWorkbench }))

import { DomainError } from '@/lib/api/route'
import { findOpexTool, needsConfirmation } from '@/features/opex-agent/server/tools/registry'

const context = { sessionId: 's1', actorId: 'local' }
const workbench = (overrides: Record<string, unknown> = {}) => ({ id: 'w1', stage: 'plan_review', runState: 'idle', plans: [{ version: 1, text: '# Plano' }], previewUrl: null, pr: null, deletionRequestedAt: null, manualCompletion: null, ...overrides })

beforeEach(() => vi.clearAllMocks())

describe('complete_workbench', () => {
  it('conclui pela mesma ação da tela, com o motivo, e pede confirmação por padrão', async () => {
    mocks.setWorkbenchStage.mockResolvedValue(workbench({ stage: 'done', manualCompletion: { reason: 'Já resolvido', fromStage: 'plan_review', at: '2026-10-28T00:00:00.000Z' } }))
    const tool = findOpexTool('complete_workbench')!
    expect(needsConfirmation(tool)).toBe(true)
    const result = (await tool.execute(tool.input.parse({ workbenchId: 'w1', reason: 'Já resolvido' }), context)) as { stage: string; manualCompletion: unknown }
    expect(mocks.setWorkbenchStage).toHaveBeenCalledWith('w1', { stage: 'done', reason: 'Já resolvido' })
    expect(result.stage).toBe('done')
    expect(result.manualCompletion).toMatchObject({ reason: 'Já resolvido' })
  })

  it('exige o motivo', () => {
    const tool = findOpexTool('complete_workbench')!
    expect(() => tool.input.parse({ workbenchId: 'w1', reason: '' })).toThrow()
  })
})

describe('set_workbench_stage', () => {
  it('aceita só etapas de espera e repassa a recusa do servidor', async () => {
    const tool = findOpexTool('set_workbench_stage')!
    expect(needsConfirmation(tool)).toBe(true)
    expect(() => tool.input.parse({ workbenchId: 'w1', stage: 'implementing', reason: 'Implementar' })).toThrow()
    mocks.setWorkbenchStage.mockRejectedValue(new DomainError(409, 'A mesa não tem um Pull Request aberto', 'WORKBENCH_INVALID_STAGE'))
    await expect(tool.execute(tool.input.parse({ workbenchId: 'w1', stage: 'pr_open', reason: 'Acompanhar' }), context)).rejects.toThrow('A mesa não tem um Pull Request aberto')
  })
})

describe('get_workbench', () => {
  it('informa as etapas que podem ser definidas agora', async () => {
    mocks.getWorkbench.mockResolvedValue(workbench())
    const tool = findOpexTool('get_workbench')!
    const result = (await tool.execute(tool.input.parse({ workbenchId: 'w1' }), context)) as { settableStages: { stage: string; available: boolean }[] }
    expect(result.settableStages.find((option) => option.stage === 'done')?.available).toBe(true)
    expect(result.settableStages.find((option) => option.stage === 'plan_review')?.available).toBe(false)
    expect(result.settableStages.find((option) => option.stage === 'pr_open')?.available).toBe(false)
  })
})
