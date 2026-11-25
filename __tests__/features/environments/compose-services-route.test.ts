import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/** Ambientes: "Ler compose" do formulário — POST /api/environments/compose-services (OPE-193). */

const mocks = vi.hoisted(() => ({ readComposeServices: vi.fn() }))

vi.mock('@/features/environments/server/compose-read', () => ({ readComposeServices: mocks.readComposeServices }))

import { POST } from '@/app/api/environments/compose-services/route'
import { DomainError } from '@/lib/api/route'

const source = { kind: 'central', centralId: 'c1', ref: 'main', composeFile: 'docker-compose.yml', services: [], projectName: 'loja' }
const post = (body: unknown) => POST(new NextRequest('http://localhost/api/environments/compose-services', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({}) })

beforeEach(() => vi.clearAllMocks())

describe('POST /api/environments/compose-services', () => {
  it('devolve os serviços e os limites declarados da origem', async () => {
    const data = { services: [{ name: 'app', hasBuild: true, declared: { memoryGb: 1, swapGb: null, cpus: 2 } }] }
    mocks.readComposeServices.mockResolvedValue(data)
    const res = await post({ source })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, data })
    expect(mocks.readComposeServices).toHaveBeenCalledWith(source)
  })

  it('origem inválida: 400 sem tocar no host', async () => {
    const res = await post({ source: { ...source, composeFile: '../x.yml' } })
    expect(res.status).toBe(400)
    expect(mocks.readComposeServices).not.toHaveBeenCalled()
  })

  it('falha na leitura: 502 com a mensagem do serviço', async () => {
    mocks.readComposeServices.mockRejectedValue(new DomainError(502, 'Não foi possível ler o compose: Ref não encontrada: x', 'ENVIRONMENT_COMPOSE_READ_FAILED'))
    const res = await post({ source })
    expect(res.status).toBe(502)
    expect(JSON.stringify(await res.json())).toContain('ENVIRONMENT_COMPOSE_READ_FAILED')
  })
})
