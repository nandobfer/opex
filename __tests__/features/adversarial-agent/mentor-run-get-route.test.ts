import { describe, expect, it, vi } from 'vitest'

/** OPE-139: `GET /api/adversarial/mentor/runs/[id]` repassa o id a `getMentorRun` (painel da sugestão no aviso da mesa). */

const mocks = vi.hoisted(() => ({ getRun: vi.fn() }))

vi.mock('@/features/adversarial-agent/server/mentor/run', () => ({ getMentorRun: mocks.getRun }))

import { NextRequest } from 'next/server'
import { DomainError } from '@/lib/api/route'
import { GET } from '@/app/api/adversarial/mentor/runs/[id]/route'

const call = (id: string) => GET(new NextRequest(`http://opex/api/adversarial/mentor/runs/${id}`), { params: Promise.resolve({ id }) })

describe('GET /api/adversarial/mentor/runs/[id]', () => {
  it('devolve a execução pedida', async () => {
    mocks.getRun.mockResolvedValueOnce({ id: 'r1', status: 'suggested', proposal: { action: 'create', memoryId: null, text: 'Proposta.', target: 'adversarial', centralId: null } })
    const res = await call('r1')
    expect(res.status).toBe(200)
    expect(mocks.getRun).toHaveBeenCalledWith('r1')
    expect((await res.json()).data).toMatchObject({ id: 'r1', status: 'suggested', proposal: { text: 'Proposta.' } })
  })

  it('execução inexistente: 404 do serviço', async () => {
    mocks.getRun.mockRejectedValueOnce(new DomainError(404, 'Execução não encontrada', 'MENTOR_RUN_NOT_FOUND'))
    const res = await call('x')
    expect(res.status).toBe(404)
    expect((await res.json()).code).toBe('MENTOR_RUN_NOT_FOUND')
  })
})
