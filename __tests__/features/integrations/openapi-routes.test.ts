import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getExplorerSpec: vi.fn(),
  executeExplorerOperation: vi.fn(),
}))

vi.mock('@/features/integrations/openapi/explorer-service', async () => {
  const actual = await vi.importActual<typeof import('@/features/integrations/openapi/explorer-service')>(
    '@/features/integrations/openapi/explorer-service',
  )
  return {
    ExplorerError: actual.ExplorerError,
    getExplorerSpec: mocks.getExplorerSpec,
    executeExplorerOperation: mocks.executeExplorerOperation,
  }
})
vi.mock('@/lib/logger', () => ({ logApiError: vi.fn(), logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { GET as openapiGET } from '@/app/api/integrations/[id]/openapi/route'
import { POST as explorePOST } from '@/app/api/integrations/[id]/explore/route'
import { ExplorerError } from '@/features/integrations/openapi/explorer-service'
import { OpenApiSpecError } from '@/features/integrations/openapi/parser'

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const post = (body: unknown) => new NextRequest('http://x', { method: 'POST', body: JSON.stringify(body) })

beforeEach(() => vi.clearAllMocks())

describe('GET /api/integrations/[id]/openapi', () => {
  it('devolve a especificação e repassa ?refresh=1', async () => {
    mocks.getExplorerSpec.mockResolvedValue({ spec: { operations: [] } })
    const res = await openapiGET(new NextRequest('http://x?refresh=1'), params('internal_api'))
    expect(res.status).toBe(200)
    expect(mocks.getExplorerSpec).toHaveBeenCalledWith('internal_api', { refresh: true })
  })

  it('especificação inválida vira 422 com a mensagem em pt-BR', async () => {
    mocks.getExplorerSpec.mockRejectedValue(new OpenApiSpecError('A URL não publica uma especificação OpenAPI 3.x'))
    const res = await openapiGET(new NextRequest('http://x'), params('internal_api'))
    expect(res.status).toBe(422)
    expect((await res.json()).error).toBe('A URL não publica uma especificação OpenAPI 3.x')
  })

  it('404 para integração desconhecida', async () => {
    const res = await openapiGET(new NextRequest('http://x'), params('nao-existe'))
    expect(res.status).toBe(404)
    expect(mocks.getExplorerSpec).not.toHaveBeenCalled()
  })
})

describe('POST /api/integrations/[id]/explore', () => {
  it('valida o corpo (operação obrigatória, campos desconhecidos recusados)', async () => {
    expect((await explorePOST(post({}), params('pusher'))).status).toBe(400)
    expect((await explorePOST(post({ operation: 'GET /jobs', url: 'https://evil' }), params('pusher'))).status).toBe(400)
    expect(mocks.executeExplorerOperation).not.toHaveBeenCalled()
  })

  it('executa com o usuário local e traduz ExplorerError', async () => {
    mocks.executeExplorerOperation.mockResolvedValue({ status: 200, body: '[]' })
    const ok = await explorePOST(post({ operation: 'GET /jobs', query: { limit: '5' } }), params('pusher'))
    expect(ok.status).toBe(200)
    expect(mocks.executeExplorerOperation).toHaveBeenCalledWith(
      'pusher',
      { operation: 'GET /jobs', query: { limit: '5' } },
      'local',
      expect.anything(),
    )

    mocks.executeExplorerOperation.mockRejectedValue(new ExplorerError('A integração não respondeu em 30 segundos', 504))
    const timeout = await explorePOST(post({ operation: 'GET /jobs' }), params('pusher'))
    expect(timeout.status).toBe(504)
  })

  it('404 para integração desconhecida', async () => {
    expect((await explorePOST(post({ operation: 'GET /x' }), params('linx'))).status).toBe(404)
  })
})
