import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { DomainError } from '@/lib/api/route'

/**
 * Webhook externo dos agentes rotineiros (OPE-130): `POST /api/v1/routine-agents/{id}/runs` com o
 * escopo `api:v1:routine-agents`, as respostas 201/400/403/404/409 e a documentação OpenAPI.
 */

const mocks = vi.hoisted(() => ({
  requireApiToken: vi.fn(async () => ({ id: 'tok1', nome: 'CI' })),
  loadAgentDoc: vi.fn(),
  triggerRoutineRun: vi.fn(async () => ({ runId: 'f'.repeat(24), status: 'running' })),
}))

vi.mock('@/features/integrations/api-tokens/service', () => ({ requireApiToken: mocks.requireApiToken }))
vi.mock('@/features/routine-agents/server/shared', () => ({
  loadAgentDoc: mocks.loadAgentDoc,
  notFoundAgent: () => new DomainError(404, 'Agente rotineiro não encontrado', 'ROUTINE_AGENT_NOT_FOUND'),
}))
vi.mock('@/features/routine-agents/server/runs', () => ({
  triggerRoutineRun: mocks.triggerRoutineRun,
  assertRunnable: (agent: { status: string; provisioning: { status: string } }) => {
    if (agent.provisioning.status !== 'ok') throw new DomainError(409, 'não provisionado', 'ROUTINE_AGENT_NOT_PROVISIONED')
  },
}))

import { POST } from '@/app/api/v1/routine-agents/[id]/runs/route'
import { buildPublicApiSpec } from '@/features/public-api/openapi/spec'
import { publicRouteScope } from '@/features/public-api/routes'
import { ROUTINE_AGENTS_API_SCOPE } from '@/features/integrations/api-tokens/scopes'

const ID = 'a'.repeat(24)
const webhook = { trigger: { id: 'w', kind: 'webhook', enabled: true }, nextAt: null, lastFiredAt: null }
const agent = (overrides: Record<string, unknown> = {}) => ({ _id: ID, status: 'active', provisioning: { status: 'ok' }, triggers: [webhook], ...overrides })
const send = (body: unknown, id = ID) => POST(new NextRequest(`http://app/api/v1/routine-agents/${id}/runs`, { method: 'POST', body: JSON.stringify(body), headers: { authorization: 'Bearer mt_sys_x', 'content-type': 'application/json' } }), { params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadAgentDoc.mockResolvedValue(agent())
})

describe('POST /api/v1/routine-agents/{id}/runs', () => {
  it('201 com { runId, status }; request e payload entram na execução; exige o escopo do catálogo', async () => {
    const response = await send({ request: 'vagas de hoje', payload: { itens: 2 } })
    expect(response.status).toBe(201)
    expect((await response.json()).data).toEqual({ runId: 'f'.repeat(24), status: 'running' })
    expect(mocks.requireApiToken).toHaveBeenCalledWith(expect.anything(), { scope: 'api:v1:routine-agents' })
    expect(mocks.triggerRoutineRun).toHaveBeenCalledWith(ID, { origin: 'webhook', triggerId: 'w', request: 'vagas de hoje', payload: { itens: 2 } }, 'api-token:tok1')
    expect(publicRouteScope('/api/v1/routine-agents/{id}/runs')).toBe(ROUTINE_AGENTS_API_SCOPE)
  })

  it('403 INSUFFICIENT_SCOPE vem do token sem o escopo', async () => {
    mocks.requireApiToken.mockRejectedValueOnce(new DomainError(403, 'sem escopo', 'INSUFFICIENT_SCOPE'))
    const response = await send({})
    expect(response.status).toBe(403)
    expect((await response.json()).code).toBe('INSUFFICIENT_SCOPE')
  })

  it('404 inexistente; 409 pausado, webhook desligado e não provisionado', async () => {
    expect((await send({}, 'nao-e-id')).status).toBe(404)
    mocks.loadAgentDoc.mockResolvedValueOnce(agent({ status: 'paused' }))
    expect((await (await send({})).json()).code).toBe('ROUTINE_AGENT_PAUSED')
    mocks.loadAgentDoc.mockResolvedValueOnce(agent({ status: 'archived' }))
    expect((await (await send({})).json()).code).toBe('ROUTINE_AGENT_PAUSED')
    mocks.loadAgentDoc.mockResolvedValueOnce(agent({ triggers: [{ ...webhook, trigger: { ...webhook.trigger, enabled: false } }] }))
    expect((await (await send({})).json()).code).toBe('ROUTINE_AGENT_WEBHOOK_DISABLED')
    mocks.loadAgentDoc.mockResolvedValueOnce(agent({ triggers: [] }))
    expect((await (await send({})).json()).code).toBe('ROUTINE_AGENT_WEBHOOK_DISABLED')
    mocks.loadAgentDoc.mockResolvedValueOnce(agent({ provisioning: { status: 'error' } }))
    const response = await send({})
    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('ROUTINE_AGENT_NOT_PROVISIONED')
    expect(mocks.triggerRoutineRun).not.toHaveBeenCalled()
  })

  it('payload acima de 64 KB → 400, sem disparar', async () => {
    const response = await send({ payload: 'x'.repeat(65 * 1024) })
    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe('PAYLOAD_TOO_LARGE')
    expect(mocks.triggerRoutineRun).not.toHaveBeenCalled()
  })

  it('documentado na OpenAPI com o parâmetro, o corpo, o escopo e as respostas', () => {
    const spec = buildPublicApiSpec() as { paths: Record<string, { post: { parameters: { name: string }[]; responses: Record<string, unknown>; 'x-opex-required-scope': string } }>; components: { schemas: Record<string, unknown> } }
    const op = spec.paths['/api/v1/routine-agents/{id}/runs']!.post
    expect(op['x-opex-required-scope']).toBe('api:v1:routine-agents')
    expect(op.parameters.map((item) => item.name)).toEqual(['id'])
    expect(Object.keys(op.responses).sort()).toEqual(['201', '400', '401', '403', '404', '409'])
    expect(Object.keys(spec.components.schemas)).toEqual(expect.arrayContaining(['RoutineAgentRunBody', 'RoutineAgentRunResponse']))
  })
})
