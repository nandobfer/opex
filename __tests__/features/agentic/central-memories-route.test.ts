import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/** OPE-97/OPE-104: rotas das memórias do agente desenvolvedor de uma central e de um cliente específico. */

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
import { GET as clientListRoute, POST as clientCreateRoute } from '@/app/api/ai/agents/[agentId]/clients/[clientId]/memories/route'

const C = 'c0000000000000000000000a'
const K = 'd0000000000000000000000b'
const M = 'm_abc123'
const request = (path: string, method: string, body?: unknown) => new NextRequest(`http://localhost/api/agentic/centrals/${C}/memories${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) })
const one = { params: Promise.resolve({ id: C, memoryId: M }) }

beforeEach(() => vi.clearAllMocks())

describe('rotas das memórias da central', () => {
  it('listar e criar usam a lista developer-central desta central', async () => {
    mocks.listAgentMemories.mockResolvedValue([])
    expect((await listRoute(request('', 'GET'), { params: Promise.resolve({ id: C }) })).status).toBe(200)
    expect(mocks.listAgentMemories).toHaveBeenCalledWith('developer-central', { centralId: C })
    mocks.createAgentMemory.mockResolvedValue({ memoria: { id: M } })
    expect((await createRoute(request('', 'POST', { texto: 'Rode o lint.', categoria: 'PROJECT_RULES' }), { params: Promise.resolve({ id: C }) })).status).toBe(201)
    expect(mocks.createAgentMemory).toHaveBeenCalledWith('developer-central', 'Rode o lint.', 'local', { centralId: C, categoria: 'PROJECT_RULES', fixada: undefined })
  })

  it('texto vazio é recusado sem chamar o serviço', async () => {
    expect((await createRoute(request('', 'POST', { texto: '  ' }), { params: Promise.resolve({ id: C }) })).status).toBe(400)
    expect(mocks.createAgentMemory).not.toHaveBeenCalled()
  })

  it('ler, editar (texto com a versão, fixar, ativar) e excluir uma memória da central', async () => {
    mocks.getAgentMemory.mockResolvedValue({ id: M })
    mocks.updateAgentMemory.mockResolvedValue({ memoria: { id: M } })
    mocks.deleteAgentMemory.mockResolvedValue({ id: M })
    expect((await getRoute(request(`/${M}`, 'GET'), one)).status).toBe(200)
    expect(mocks.getAgentMemory).toHaveBeenCalledWith('developer-central', M, { centralId: C })
    expect((await updateRoute(request(`/${M}`, 'PATCH', { texto: 'Rode lint e tsc.', versao: 2 }), one)).status).toBe(200)
    expect(mocks.updateAgentMemory).toHaveBeenCalledWith('developer-central', M, { texto: 'Rode lint e tsc.', versao: 2 }, 'local', { centralId: C })
    expect((await updateRoute(request(`/${M}`, 'PATCH', { ativa: false }), one)).status).toBe(200)
    expect(mocks.updateAgentMemory).toHaveBeenLastCalledWith('developer-central', M, { ativa: false }, 'local', { centralId: C })
    expect((await updateRoute(request(`/${M}`, 'PATCH', {}), one)).status).toBe(400)
    expect((await deleteRoute(request(`/${M}`, 'DELETE'), one)).status).toBe(200)
    expect(mocks.deleteAgentMemory).toHaveBeenCalledWith('developer-central', M, 'local', { centralId: C })
  })

  it('lista de um cliente específico: o cliente vem da rota', async () => {
    mocks.listAgentMemories.mockResolvedValue([])
    const params = { params: Promise.resolve({ agentId: 'opex-client-specific', clientId: K }) }
    expect((await clientListRoute(new NextRequest('http://localhost/x'), params)).status).toBe(200)
    expect(mocks.listAgentMemories).toHaveBeenCalledWith('opex-client-specific', { clientId: K })
    mocks.createAgentMemory.mockResolvedValue({ memoria: { id: M } })
    expect((await clientCreateRoute(new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify({ texto: 'Cliente quer PDF.' }) }), params)).status).toBe(201)
    expect(mocks.createAgentMemory).toHaveBeenCalledWith('opex-client-specific', 'Cliente quer PDF.', 'local', { clientId: K, categoria: undefined, fixada: undefined })
  })
})
