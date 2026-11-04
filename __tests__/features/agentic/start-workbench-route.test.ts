import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ startWorkbench: vi.fn() }))

vi.mock('@/features/agentic/server/workflow', () => ({ startWorkbench: mocks.startWorkbench }))

import { POST } from '@/app/api/agentic/workbenches/route'

const CENTRAL = 'a'.repeat(24)
const TASK = 'b'.repeat(24)

const call = (body: unknown) => POST(new NextRequest('http://localhost/api/agentic/workbenches', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => vi.clearAllMocks())

describe('POST /api/agentic/workbenches', () => {
  it('abre a mesa e repassa as informações adicionais', async () => {
    mocks.startWorkbench.mockResolvedValue({ id: 'w1' })
    const res = await call({ centralId: CENTRAL, taskId: TASK, text: 'Use o componente X' })
    expect(res.status).toBe(201)
    expect(mocks.startWorkbench).toHaveBeenCalledWith(CENTRAL, TASK, 'Use o componente X', undefined, undefined)
  })

  it('sem informações adicionais chama com texto indefinido', async () => {
    mocks.startWorkbench.mockResolvedValue({ id: 'w1' })
    expect((await call({ centralId: CENTRAL, taskId: TASK })).status).toBe(201)
    expect(mocks.startWorkbench).toHaveBeenCalledWith(CENTRAL, TASK, undefined, undefined, undefined)
  })

  it('aceita informações adicionais sem limite artificial de caracteres', async () => {
    mocks.startWorkbench.mockResolvedValue({ id: 'w1' })
    const text = 'x'.repeat(20_000)
    const res = await call({ centralId: CENTRAL, taskId: TASK, text })
    expect(res.status).toBe(201)
    expect(mocks.startWorkbench).toHaveBeenCalledWith(CENTRAL, TASK, text, undefined, undefined)
  })
})

describe('POST /api/agentic/workbenches · modelos da etapa inicial (OPE-134)', () => {
  it('repassa as trocas escolhidas na abertura', async () => {
    mocks.startWorkbench.mockResolvedValue({ id: 'w1' })
    const modelOverrides = { planning: { model: 'openai/gpt-5', variant: 'high' }, fork: { model: 'anthropic/opus', variant: null } }
    const res = await call({ centralId: CENTRAL, taskId: TASK, modelOverrides })
    expect(res.status).toBe(201)
    expect(mocks.startWorkbench).toHaveBeenCalledWith(CENTRAL, TASK, undefined, undefined, modelOverrides)
  })

  it('papel fora das etapas da mesa é recusado (400) sem abrir', async () => {
    const res = await call({ centralId: CENTRAL, taskId: TASK, modelOverrides: { deploy: { model: 'openai/gpt-5', variant: null } } })
    expect(res.status).toBe(400)
    expect(mocks.startWorkbench).not.toHaveBeenCalled()
  })

  it('troca sem modelo é recusada (400): a abertura só aceita modelo próprio', async () => {
    const res = await call({ centralId: CENTRAL, taskId: TASK, modelOverrides: { planning: { model: null, variant: null } } })
    expect(res.status).toBe(400)
    expect(mocks.startWorkbench).not.toHaveBeenCalled()
  })
})
