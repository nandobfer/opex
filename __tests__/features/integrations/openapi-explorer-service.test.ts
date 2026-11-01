import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getIntegration: vi.fn(),
  recordAudit: vi.fn(),
  debug: { info: vi.fn(), step: vi.fn(), request: vi.fn(), response: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/integrations/config', () => ({
  getIntegration: mocks.getIntegration,
  getInternalBaseUrl: async () => 'http://127.0.0.1:3868',
  getIntegrationConfig: async () => ({}),
}))
vi.mock('@/lib/integrations/debug', () => ({ integrationDebug: () => mocks.debug }))
vi.mock('@/lib/db', () => ({ recordAudit: mocks.recordAudit, AcaoAuditoria: { ATUALIZAR: 'ATUALIZAR' } }))
vi.mock('@/features/integrations/services/integration-service', () => ({ INTEGRATION_AUDIT_ENTITY: 'Integracao' }))

import { clearSpecCache, findSpecUrlCandidates, loadOpenApiSpec } from '@/features/integrations/openapi/spec-source'
import {
  ExplorerError,
  executeExplorerOperation,
  getExplorerSpec,
} from '@/features/integrations/openapi/explorer-service'
import { EXPLORER_ADAPTER_IDS } from '@/features/integrations/openapi/adapters'

const actor = 'local'
const INTERNAL = 'http://127.0.0.1:3868'
const SWAGGER = 'https://smm.exemplo.com/docs'
const SPEC_URL = 'https://smm.exemplo.com/openapi.json'

const spec = {
  openapi: '3.1.0',
  info: { title: 'SMM', version: '1' },
  servers: [{ url: 'https://outro-host.exemplo.com' }],
  paths: {
    '/api/v1/business-partners/{bp}': {
      get: { parameters: [{ name: 'bp', in: 'path', schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } },
    },
    '/api/v1/business-partners/search': {
      post: {
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '200': { description: 'OK' } },
      },
    },
  },
}

const html = `<!doctype html><html><body><div id="swagger-ui"></div><script>
const ui = SwaggerUIBundle({ url: '/openapi.json', dom_id: '#swagger-ui' })</script></body></html>`

const fetchMock = vi.fn()

function route(handlers: Record<string, () => Response>) {
  fetchMock.mockImplementation(async (url: string) => {
    const handler = handlers[url]
    if (!handler) return new Response('not found', { status: 404 })
    const response = handler()
    Object.defineProperty(response, 'url', { value: url })
    return response
  })
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  vi.clearAllMocks()
  clearSpecCache()
  vi.stubGlobal('fetch', fetchMock)
  mocks.getIntegration.mockResolvedValue({
    swaggerUrl: SWAGGER,
    values: {},
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('localização da especificação', () => {
  it('encontra a URL da especificação no HTML do Swagger UI (relativa à página)', () => {
    expect(findSpecUrlCandidates(html, SWAGGER)).toEqual([SPEC_URL])
  })

  it('URL do /docs (HTML) → baixa o openapi.json indicado pela página', async () => {
    route({
      [SWAGGER]: () => new Response(html, { headers: { 'content-type': 'text/html' } }),
      [SPEC_URL]: () => json(spec),
    })
    const loaded = await loadOpenApiSpec(SWAGGER)
    expect(loaded.specUrl).toBe(SPEC_URL)
    expect(loaded.spec.operations).toHaveLength(2)
  })

  it('HTML sem especificação → erro OpenAPI 3.x em pt-BR', async () => {
    route({ [SWAGGER]: () => new Response('<html>nada</html>', { headers: { 'content-type': 'text/html' } }) })
    await expect(loadOpenApiSpec(SWAGGER)).rejects.toThrow('A URL não publica uma especificação OpenAPI 3.x')
  })

  it('usa cache; refresh força nova leitura', async () => {
    route({ [SPEC_URL]: () => json(spec) })
    await loadOpenApiSpec(SPEC_URL)
    await loadOpenApiSpec(SPEC_URL)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await loadOpenApiSpec(SPEC_URL, { refresh: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('explorador — adaptadores e execução', () => {
  it('adaptadores implementados: API interna e Engramind', () => {
    expect(EXPLORER_ADAPTER_IDS).toEqual(['internal_api', 'engramind'])
  })

  it('Engramind: a base é a URL do campo, e o servidor injeta o Bearer do token admin (sem ele, nada é injetado)', async () => {
    const ENG = 'http://engramind-api:8000'
    const engSpec = { ...spec, servers: [{ url: '.' }], paths: { '/v1/whoami': { get: { responses: { '200': { description: 'OK' } } } } } }
    mocks.getIntegration.mockResolvedValue({ swaggerUrl: `${ENG}/openapi.json`, values: { baseUrl: `${ENG}/`, adminToken: 'eng.tk_segredo' } })
    route({ [`${ENG}/openapi.json`]: () => json(engSpec), [`${ENG}/v1/whoami`]: () => json({ ok: true }) })
    const dto = await getExplorerSpec('engramind')
    expect(dto.baseUrl).toBe(ENG)
    expect(dto.authReady).toBe(true)
    expect(dto.auth).toMatch(/token admin do Opex/)
    expect(JSON.stringify(dto)).not.toContain('eng.tk_segredo')
    await executeExplorerOperation('engramind', { operation: 'GET /v1/whoami', headers: { Authorization: 'Bearer forjado' } }, actor)
    expect(fetchMock.mock.calls.at(-1)![1].headers.Authorization).toBe('Bearer eng.tk_segredo')
    mocks.getIntegration.mockResolvedValue({ swaggerUrl: `${ENG}/openapi.json`, values: { baseUrl: ENG } })
    expect((await getExplorerSpec('engramind')).authReady).toBe(false)
  })

  it('API interna: a base é a URL interna (não o servers da especificação), sem credencial injetada', async () => {
    route({ [SWAGGER]: () => json(spec) })
    const dto = await getExplorerSpec('internal_api')
    expect(dto.baseUrl).toBe(INTERNAL)
    expect(dto.authReady).toBe(false)
    expect(dto.auth).toMatch(/token de sistema informado/)
    expect(dto.clientAuthorization).toBe(true)
  })

  it('API interna: repassa o Authorization informado no explorador só para a URL interna', async () => {
    route({
      [SWAGGER]: () => json(spec),
      [`${INTERNAL}/api/v1/business-partners/7`]: () => json({ ok: true }),
    })
    await executeExplorerOperation(
      'internal_api',
      { operation: 'GET /api/v1/business-partners/{bp}', path: { bp: '7' }, headers: { Authorization: 'Bearer mt_sys_abc', Cookie: 'x=1' } },
      actor,
    )
    const [, init] = fetchMock.mock.calls.at(-1)!
    expect(init.headers.Authorization).toBe('Bearer mt_sys_abc')
    expect(init.headers.Cookie).toBeUndefined()
  })

  it('API interna: executa na URL interna com o caminho codificado e sem Authorization injetado', async () => {
    route({
      [SWAGGER]: () => json(spec),
      [`${INTERNAL}/api/v1/business-partners/1001%2F2`]: () => json({ ok: true }),
    })
    const result = await executeExplorerOperation(
      'internal_api',
      { operation: 'GET /api/v1/business-partners/{bp}', path: { bp: '1001/2' }, headers: { Cookie: 'x=1', 'X-Trace': 't1' } },
      actor,
    )
    expect(result.status).toBe(200)
    const [url, init] = fetchMock.mock.calls.at(-1)!
    // Parâmetro de caminho codificado: não escapa do template.
    expect(url).toBe(`${INTERNAL}/api/v1/business-partners/1001%2F2`)
    expect(init.headers.Authorization).toBeUndefined()
    expect(init.headers.Cookie).toBeUndefined()
    expect(init.headers['X-Trace']).toBe('t1')
    expect(init.redirect).toBe('manual')
    // GET não gera auditoria.
    expect(mocks.recordAudit).not.toHaveBeenCalled()
  })

  it('recusa operação que não existe na especificação (sem URL livre)', async () => {
    route({ [SWAGGER]: () => json(spec) })
    await expect(
      executeExplorerOperation('internal_api', { operation: 'GET https://evil.exemplo.com/x' }, actor),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('método que altera dados gera auditoria (sem o corpo) e envia Content-Type', async () => {
    route({
      [SWAGGER]: () => json(spec),
      [`${INTERNAL}/api/v1/business-partners/search`]: () => json({ total: 1 }, 201),
    })
    await executeExplorerOperation(
      'internal_api',
      { operation: 'POST /api/v1/business-partners/search', body: '{"query":"paulo jacobs"}' },
      actor,
    )
    const [, init] = fetchMock.mock.calls.at(-1)!
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.body).toBe('{"query":"paulo jacobs"}')
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'local',
        entidade: 'Integracao',
        entidadeId: 'internal_api',
        depois: { explorador: 'POST /api/v1/business-partners/search', operacao: 'POST /api/v1/business-partners/search', status: 201 },
      }),
    )
    expect(JSON.stringify(mocks.recordAudit.mock.calls[0][0])).not.toContain('paulo jacobs')
  })

  it('sem adaptador: segue o servers da especificação e NÃO envia credenciais', async () => {
    mocks.getIntegration.mockResolvedValue({ swaggerUrl: SWAGGER, values: { appId: '1', secret: 'segredo-pusher' } })
    route({
      [SWAGGER]: () => json(spec),
      'https://outro-host.exemplo.com/api/v1/business-partners/1': () => json({}),
    })
    await executeExplorerOperation('pusher', { operation: 'GET /api/v1/business-partners/{bp}', path: { bp: '1' } }, actor)
    const [url, init] = fetchMock.mock.calls.at(-1)!
    expect(url).toBe('https://outro-host.exemplo.com/api/v1/business-partners/1')
    expect(init.headers.Authorization).toBeUndefined()
    expect(JSON.stringify(init)).not.toContain('segredo-pusher')

    const dto = await getExplorerSpec('pusher')
    expect(dto.baseUrl).toBe('https://outro-host.exemplo.com')
    expect(dto.auth).toBeNull()
  })

  it('sem documentação cadastrada → 409 acionável', async () => {
    mocks.getIntegration.mockResolvedValue({ values: {} })
    await expect(getExplorerSpec('pusher')).rejects.toBeInstanceOf(ExplorerError)
    await expect(getExplorerSpec('pusher')).rejects.toMatchObject({ status: 409 })
  })
})
