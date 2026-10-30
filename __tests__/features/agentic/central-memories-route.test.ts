import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/** OPE-97: rotas das memórias do agente desenvolvedor de uma central. */

const mocks = vi.hoisted(() => ({
  listAgentMemories: vi.fn(),
  createAgentMemory: vi.fn(),
  getAgentMemory: vi.fn(),
  updateAgentMemory: vi.fn(),
  deleteAgentMemory: vi.fn(),
}))
vi.mock('@/features/ai/server/agent-memory-service', () => mocks)

import { GET as listRoute, POST as createRoute } from '@/app/api/agentic/centrals/[id]/memories/route'
import { DELETE as deleteRoute, GET as getRoute, PATCH as updateRoute } from '@/app/api/agentic/centrals/[id]/memories/[memoryId]/route'

const C = 'c0000000000000000000000a'
const M = 'a'.repeat(24)
const request = (path: string, method: string, body?: unknown) => new NextRequest(`http://localhost/api/agentic/centrals/${C}/memories${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) })
const one = { params: Promise.resolve({ id: C, memoryId: M }) }

beforeEach(() => vi.clearAllMocks())

describe('rotas das memórias da central', () => {
  it('listar e criar usam a lista developer-central desta central', async () => {
    mocks.listAgentMemories.mockResolvedValue([])
    expect((await listRoute(request('', 'GET'), { params: Promise.resolve({ id: C }) })).status).toBe(200)
    expect(mocks.listAgentMemories).toHaveBeenCalledWith('developer-central', C)
    mocks.createAgentMemory.mockResolvedValue({ memoria: { id: M }, formatadaPorIa: true })
    expect((await createRoute(request('', 'POST', { texto: 'Rode o lint.' }), { params: Promise.resolve({ id: C }) })).status).toBe(201)
    expect(mocks.createAgentMemory).toHaveBeenCalledWith('developer-central', 'Rode o lint.', 'local', { centralId: C })
  })

  it('texto inválido é recusado sem chamar o serviço', async () => {
    expect((await createRoute(request('', 'POST', { texto: 'x' }), { params: Promise.resolve({ id: C }) })).status).toBe(400)
    expect(mocks.createAgentMemory).not.toHaveBeenCalled()
  })

  it('ler, editar e excluir uma memória da central', async () => {
    mocks.getAgentMemory.mockResolvedValue({ id: M })
    mocks.updateAgentMemory.mockResolvedValue({ memoria: { id: M }, formatadaPorIa: true })
    mocks.deleteAgentMemory.mockResolvedValue({ id: M })
    expect((await getRoute(request(`/${M}`, 'GET'), one)).status).toBe(200)
    expect(mocks.getAgentMemory).toHaveBeenCalledWith('developer-central', M, C)
    expect((await updateRoute(request(`/${M}`, 'PATCH', { texto: 'Rode lint e tsc.' }), one)).status).toBe(200)
    expect(mocks.updateAgentMemory).toHaveBeenCalledWith('developer-central', M, 'Rode lint e tsc.', 'local', { centralId: C })
    expect((await deleteRoute(request(`/${M}`, 'DELETE'), one)).status).toBe(200)
    expect(mocks.deleteAgentMemory).toHaveBeenCalledWith('developer-central', M, 'local', C)
  })
})
