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
    expect(mocks.startWorkbench).toHaveBeenCalledWith(CENTRAL, TASK, 'Use o componente X')
  })

  it('sem informações adicionais chama com texto indefinido', async () => {
    mocks.startWorkbench.mockResolvedValue({ id: 'w1' })
    expect((await call({ centralId: CENTRAL, taskId: TASK })).status).toBe(201)
    expect(mocks.startWorkbench).toHaveBeenCalledWith(CENTRAL, TASK, undefined)
  })

  it('texto acima de 8.000 caracteres é rejeitado', async () => {
    const res = await call({ centralId: CENTRAL, taskId: TASK, text: 'x'.repeat(8001) })
    expect(res.status).toBe(400)
    expect(mocks.startWorkbench).not.toHaveBeenCalled()
  })
})
