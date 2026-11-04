import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/** Rotas do refinamento na mesa (OPE-137): "Refinar tarefa" e o switch "Gerar plano após refinar". */

const mocks = vi.hoisted(() => ({ refine: vi.fn(), setPlan: vi.fn() }))

vi.mock('@/features/agentic/server/workflow', () => ({ refineWorkbench: mocks.refine, setWorkbenchPlanAfterRefinement: mocks.setPlan }))

import { POST } from '@/app/api/agentic/workbenches/refine/route'
import { PUT } from '@/app/api/agentic/workbenches/[id]/refinement-plan/route'

const CENTRAL = 'a'.repeat(24)
const TASK = 'b'.repeat(24)

beforeEach(() => vi.clearAllMocks())

describe('POST /api/agentic/workbenches/refine', () => {
  it('repassa o texto, os anexos e os modelos ao fluxo da mesa', async () => {
    mocks.refine.mockResolvedValue({ workbench: { id: 'w1', stage: 'refining' }, queue: null })
    const res = await POST(new NextRequest('http://localhost/api/agentic/workbenches/refine', { method: 'POST', body: JSON.stringify({ centralId: CENTRAL, taskId: TASK, text: 'Regra X', modelOverrides: { refinement: { model: 'openai/gpt-5' } } }) }))
    expect(res.status).toBe(201)
    expect(mocks.refine).toHaveBeenCalledWith(CENTRAL, TASK, { text: 'Regra X', fileIds: undefined, modelOverrides: { refinement: { model: 'openai/gpt-5', variant: null } } })
  })

  it('sem vaga devolve a posição na fila', async () => {
    mocks.refine.mockResolvedValue({ workbench: null, queue: { position: 3 } })
    const res = await POST(new NextRequest('http://localhost/api/agentic/workbenches/refine', { method: 'POST', body: JSON.stringify({ centralId: CENTRAL, taskId: TASK }) }))
    expect(await res.json()).toMatchObject({ success: true, data: { workbench: null, queue: { position: 3 } } })
  })

  it('papel de modelo desconhecido é recusado sem chamar o fluxo', async () => {
    const res = await POST(new NextRequest('http://localhost/api/agentic/workbenches/refine', { method: 'POST', body: JSON.stringify({ centralId: CENTRAL, taskId: TASK, modelOverrides: { outro: { model: 'x' } } }) }))
    expect(res.status).toBe(400)
    expect(mocks.refine).not.toHaveBeenCalled()
  })
})

describe('PUT /api/agentic/workbenches/[id]/refinement-plan', () => {
  it('liga ou desliga o "Gerar plano após refinar" da mesa', async () => {
    mocks.setPlan.mockResolvedValue({ id: 'w1', planAfterRefinement: true })
    const res = await PUT(new NextRequest('http://localhost/api/agentic/workbenches/w1/refinement-plan', { method: 'PUT', body: JSON.stringify({ enabled: true }) }), { params: Promise.resolve({ id: 'w1' }) })
    expect(res.status).toBe(200)
    expect(mocks.setPlan).toHaveBeenCalledWith('w1', true)
  })

  it('corpo inválido responde 400', async () => {
    const res = await PUT(new NextRequest('http://localhost/api/agentic/workbenches/w1/refinement-plan', { method: 'PUT', body: JSON.stringify({ enabled: 'sim' }) }), { params: Promise.resolve({ id: 'w1' }) })
    expect(res.status).toBe(400)
  })
})
