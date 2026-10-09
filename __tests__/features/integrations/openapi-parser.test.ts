import { describe, expect, it } from 'vitest'
import { OpenApiSpecError, parseOpenApiSpec } from '@/features/integrations/openapi/parser'
import {
  buildExample,
  initialBodyText,
  jsonError,
  splitParameterValues,
  validateParameters,
} from '@/features/integrations/openapi/examples'
import { UNTAGGED } from '@/features/integrations/openapi/types'

/** Especificação no formato do FastAPI (Pydantic v2): anyOf com null, allOf, $ref e tags. */
const spec = {
  openapi: '3.1.0',
  info: { title: 'SAP Middleman', version: '1.4.0' },
  servers: [{ url: '/api' }],
  security: [{ HTTPBearer: [] }],
  tags: [{ name: 'business-partners', description: 'Parceiros de negócio' }, { name: 'sem-operacoes' }],
  paths: {
    '/v1/business-partners/{bp}': {
      parameters: [{ name: 'bp', in: 'path', schema: { type: 'string' } }],
      get: {
        tags: ['business-partners'],
        summary: 'Detalhe do BP',
        operationId: 'get_bp',
        parameters: [
          { name: 'expand', in: 'query', schema: { type: 'string', enum: ['roles', 'address'] } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          { name: 'session', in: 'cookie', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Partner' } } } } },
      },
    },
    '/v1/business-partners/search': {
      post: {
        tags: ['business-partners'],
        requestBody: { $ref: '#/components/requestBodies/Search' },
        responses: { '422': { $ref: '#/components/responses/Invalid' } },
      },
    },
    '/health': { get: { security: [], responses: { '200': { description: 'OK' } } } },
  },
  components: {
    requestBodies: {
      Search: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SearchRequest' } } } },
    },
    responses: { Invalid: { description: 'Erro de validação' } },
    schemas: {
      SearchRequest: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', example: 'paulo jacobs' },
          limit: { anyOf: [{ type: 'integer' }, { type: 'null' }], default: 20 },
          createdAt: { type: 'string', format: 'date-time', readOnly: true },
          filters: { $ref: '#/components/schemas/Filters' },
        },
      },
      Filters: { type: 'object', properties: { roles: { type: 'array', items: { type: 'string' } } } },
      Partner: {
        allOf: [{ $ref: '#/components/schemas/Base' }, { type: 'object', required: ['name'], properties: { name: { type: 'string' } } }],
      },
      Base: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      Node: { type: 'object', properties: { child: { $ref: '#/components/schemas/Node' } } },
    },
  },
}

describe('parseOpenApiSpec (issue #604)', () => {
  const parsed = parseOpenApiSpec(spec)

  it('lê info, servers e agrupa operações por tag, com "Outros" por último e tags vazias fora', () => {
    expect(parsed.info).toEqual({ title: 'SAP Middleman', version: '1.4.0' })
    expect(parsed.servers).toEqual(['/api'])
    expect(parsed.tags.map((t) => t.name)).toEqual(['business-partners', UNTAGGED])
    expect(parsed.tags[0].description).toBe('Parceiros de negócio')
    expect(parsed.tags[0].operations).toEqual(['GET /v1/business-partners/{bp}', 'POST /v1/business-partners/search'])
  })

  it('identifica operações sem operationId por MÉTODO + caminho', () => {
    const op = parsed.operations.find((o) => o.path === '/v1/business-partners/search')!
    expect(op.key).toBe('POST /v1/business-partners/search')
    expect(op.operationId).toBeUndefined()
  })

  it('mescla parâmetros do caminho e da operação; path é sempre obrigatório; cookie fica de fora', () => {
    const op = parsed.operations.find((o) => o.key === 'GET /v1/business-partners/{bp}')!
    expect(op.parameters.map((p) => `${p.in}:${p.name}`)).toEqual(['path:bp', 'query:expand', 'query:limit'])
    expect(op.parameters[0].required).toBe(true)
    expect(op.parameters[1].schema.enum).toEqual(['roles', 'address'])
  })

  it('resolve requestBody/responses por $ref e mantém schemas como { ref }', () => {
    const op = parsed.operations.find((o) => o.key === 'POST /v1/business-partners/search')!
    expect(op.requestBody).toMatchObject({ required: true, contentType: 'application/json', schema: { ref: 'SearchRequest' } })
    expect(op.responses).toEqual([{ status: '422', description: 'Erro de validação' }])
    const get = parsed.operations.find((o) => o.key === 'GET /v1/business-partners/{bp}')!
    expect(get.responses[0].schema).toEqual({ ref: 'Partner' })
  })

  it('security global vale para a operação; security: [] a torna pública', () => {
    expect(parsed.operations.find((o) => o.key === 'GET /v1/business-partners/{bp}')!.secured).toBe(true)
    expect(parsed.operations.find((o) => o.key === 'GET /health')!.secured).toBe(false)
  })

  it('anyOf [X, null] (Pydantic) vira X anulável; allOf mescla propriedades e obrigatórios', () => {
    expect(parsed.schemas.SearchRequest.properties!.limit).toMatchObject({ type: 'integer', nullable: true, default: 20 })
    expect(parsed.schemas.Partner).toMatchObject({ type: 'object', required: ['id', 'name'] })
    expect(Object.keys(parsed.schemas.Partner.properties!)).toEqual(['id', 'name'])
  })

  it('referência circular é inofensiva (fica como { ref })', () => {
    expect(parsed.schemas.Node.properties!.child).toEqual({ ref: 'Node' })
  })

  it('recusa Swagger 2.0 e o que não é OpenAPI 3.x, com mensagem em pt-BR', () => {
    expect(() => parseOpenApiSpec({ swagger: '2.0', paths: {} })).toThrow(/Swagger 2\.0.*OpenAPI 3\.x/)
    expect(() => parseOpenApiSpec({ openapi: '4.0.0' })).toThrow(OpenApiSpecError)
    expect(() => parseOpenApiSpec('texto')).toThrow(/OpenAPI 3\.x/)
  })
})

describe('exemplos e parâmetros do explorador', () => {
  const parsed = parseOpenApiSpec(spec)

  it('gera o corpo a partir do schema: example, default, formato; ignora readOnly', () => {
    expect(buildExample({ ref: 'SearchRequest' }, parsed.schemas)).toEqual({
      query: 'paulo jacobs',
      limit: 20,
      filters: { roles: ['string'] },
    })
    expect(buildExample({ ref: 'Partner' }, parsed.schemas)).toEqual({ id: '00000000-0000-4000-8000-000000000000', name: 'string' })
  })

  it('ciclo não trava a geração do exemplo', () => {
    expect(buildExample({ ref: 'Node' }, parsed.schemas)).toEqual({})
  })

  it('o exemplo declarado na operação tem precedência sobre o gerado', () => {
    expect(initialBodyText({ a: 1 }, { ref: 'SearchRequest' }, parsed.schemas)).toBe('{\n  "a": 1\n}')
  })

  it('valida obrigatórios, números e enum', () => {
    const op = parsed.operations.find((o) => o.key === 'GET /v1/business-partners/{bp}')!
    const errors = validateParameters(op.parameters, { 'query:limit': '1.5', 'query:expand': 'x' }, parsed.schemas)
    expect(errors).toEqual({
      'path:bp': 'Obrigatório',
      'query:limit': 'Informe um número inteiro',
      'query:expand': 'Valor fora da lista permitida',
    })
  })

  it('separa valores por local e descarta vazios', () => {
    const op = parsed.operations.find((o) => o.key === 'GET /v1/business-partners/{bp}')!
    expect(splitParameterValues(op.parameters, { 'path:bp': ' 1001 ', 'query:limit': '', 'query:expand': 'roles' })).toEqual({
      path: { bp: '1001' },
      query: { expand: 'roles' },
      headers: {},
    })
  })

  it('jsonError aponta JSON inválido e aceita vazio', () => {
    expect(jsonError('')).toBeNull()
    expect(jsonError('{"a":1}')).toBeNull()
    expect(jsonError('{a:1}')).toMatch(/^JSON inválido/)
  })
})
