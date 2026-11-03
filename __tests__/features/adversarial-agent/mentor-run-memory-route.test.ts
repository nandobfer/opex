import { describe, expect, it, vi } from 'vitest'

/** OPE-128: `GET /api/adversarial/mentor/runs/[id]/memory` repassa o id da execução a `getMentorRunMemory`. */

const mocks = vi.hoisted(() => ({ getMemory: vi.fn() }))

vi.mock('@/features/adversarial-agent/server/mentor/run', () => ({ getMentorRunMemory: mocks.getMemory }))

import { NextRequest } from 'next/server'
import { DomainError } from '@/lib/api/route'
import { GET } from '@/app/api/adversarial/mentor/runs/[id]/memory/route'

const call = (id: string) => GET(new NextRequest(`http://opex/api/adversarial/mentor/runs/${id}/memory`), { params: Promise.resolve({ id }) })

describe('GET /api/adversarial/mentor/runs/[id]/memory', () => {
  it('devolve o resumo da execução pedida', async () => {
    mocks.getMemory.mockResolvedValueOnce({ state: 'ok', resumo: 'Conferir providers', resumoPendente: false, atualizadaEm: null })
    const res = await call('r1')
    expect(res.status).toBe(200)
    expect(mocks.getMemory).toHaveBeenCalledWith('r1')
    expect((await res.json()).data).toMatchObject({ state: 'ok', resumo: 'Conferir providers' })
  })

  it('execução inexistente: 404 do serviço', async () => {
    mocks.getMemory.mockRejectedValueOnce(new DomainError(404, 'Execução não encontrada', 'MENTOR_RUN_NOT_FOUND'))
    const res = await call('x')
    expect(res.status).toBe(404)
  })
})
