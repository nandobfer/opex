import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeCollection, type FakeCollection } from '../../helpers/fake-collection'

/**
 * OAuth dos MCPs do Agente Opex (OPE-176) de ponta a ponta com a `@ai-sdk/mcp` REAL: só a rede é
 * simulada (servidor MCP com metadados de recurso protegido + servidor de autorização com registro
 * dinâmico, token, renovação e revogação). Coleção em memória no lugar do Mongo.
 */

const holder = vi.hoisted(() => ({
  servers: null as unknown,
  audit: [] as Record<string, unknown>[],
  events: [] as unknown[],
}))

vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined, recordAudit: async (input: Record<string, unknown>) => void holder.audit.push(input), AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR' } }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: async (...args: unknown[]) => void holder.events.push(args) }))
vi.mock('@/lib/logger', () => ({ loggerFor: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }), logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/db/models/Opex', () => ({
  get OpexMcpServer() {
    return holder.servers
  },
}))
vi.mock('@/lib/db/models/Orcamento', () => ({ OrcamentoClient: { find: () => ({ select: () => ({ lean: async () => [] }) }), updateMany: async () => ({}) } }))
vi.mock('@/features/auth/server/context', () => ({ requireAdminSession: vi.fn(async () => ({ kind: 'admin' })) }))

import { auth } from '@ai-sdk/mcp'
import { createMcpServer, deleteMcpServer, getMcpServer, mergeMcpOauth, testMcpConnection, updateMcpServer } from '@/features/opex-agent/server/mcp/service'
import { disconnectMcpOauth, finishMcpOauth, startMcpOauth } from '@/features/opex-agent/server/mcp/oauth'
import { createMcpOauthProvider, missingScopes, OpexMcpAuthRequiredError } from '@/features/opex-agent/server/mcp/oauth-provider'
import { connectMcp, isMcpAuthError } from '@/features/opex-agent/server/mcp/connect'
import { opexMcpServerInputSchema, type OpexMcpServerInput } from '@/features/opex-agent/mcp'
import type { IOpexMcpOauth, IOpexMcpOauthPending } from '@/lib/db/models/Opex'
import { POST as startRoute } from '@/app/api/opex/mcp-servers/[id]/oauth/route'
import { GET as callbackRoute } from '@/app/api/opex/mcp-servers/oauth/callback/route'
import { requireAdminSession } from '@/features/auth/server/context'

const KEY = Buffer.alloc(32, 9).toString('base64')
const MCP_URL = 'https://mcp.test/mcp'
const servers = () => holder.servers as FakeCollection

interface FakeAuthServer {
  registered: Record<string, unknown>[]
  tokenRequests: URLSearchParams[]
  revoked: string[]
  challenge: string | null
  grantedScope: string | undefined
  refreshOk: boolean
  counter: number
  revocationEndpoint: string
  calls: string[]
}
let as: FakeAuthServer

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  const method = (init?.method ?? 'GET').toUpperCase()
  as.calls.push(`${method} ${url.href}`)
  const body = init?.body instanceof URLSearchParams ? init.body : typeof init?.body === 'string' ? (init.body.startsWith('{') ? null : new URLSearchParams(init.body)) : null
  if (url.origin === 'https://mcp.test' && url.pathname.startsWith('/.well-known/oauth-protected-resource'))
    return Promise.resolve(json({ resource: MCP_URL, authorization_servers: ['https://auth.test'] }))
  if (url.origin === 'https://auth.test' && url.pathname === '/.well-known/oauth-authorization-server')
    return Promise.resolve(
      json({
        issuer: 'https://auth.test',
        authorization_endpoint: 'https://auth.test/authorize',
        token_endpoint: 'https://auth.test/token',
        registration_endpoint: 'https://auth.test/register',
        revocation_endpoint: as.revocationEndpoint,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
      }),
    )
  if (url.href === 'https://auth.test/register' && method === 'POST') {
    const metadata = JSON.parse(String(init?.body)) as Record<string, unknown>
    as.registered.push(metadata)
    return Promise.resolve(json({ ...metadata, client_id: `dyn-${as.registered.length}` }, 201))
  }
  if (url.href === 'https://auth.test/token' && method === 'POST' && body) {
    as.tokenRequests.push(body)
    as.counter++
    if (body.get('grant_type') === 'authorization_code') {
      const verifier = body.get('code_verifier') ?? ''
      const challenge = createHash('sha256').update(verifier).digest('base64url')
      if (body.get('code') !== 'codigo-bom' || challenge !== as.challenge) return Promise.resolve(json({ error: 'invalid_grant' }, 400))
      return Promise.resolve(json({ access_token: `at-${as.counter}`, refresh_token: `rt-${as.counter}`, token_type: 'Bearer', expires_in: 3600, ...(as.grantedScope !== undefined ? { scope: as.grantedScope } : {}) }))
    }
    if (body.get('grant_type') === 'refresh_token') {
      if (!as.refreshOk) return Promise.resolve(json({ error: 'invalid_grant' }, 400))
      return Promise.resolve(json({ access_token: `at-${as.counter}`, refresh_token: `rt-${as.counter}`, token_type: 'Bearer', expires_in: 3600 }))
    }
  }
  if (url.href === 'https://auth.test/revoke' && method === 'POST' && body) {
    as.revoked.push(body.get('token') ?? '')
    return Promise.resolve(new Response(null, { status: 200 }))
  }
  return Promise.resolve(new Response('not found', { status: 404 }))
}

const baseInput = (over: Partial<OpexMcpServerInput> = {}): OpexMcpServerInput =>
  opexMcpServerInputSchema.parse({
    name: 'Linear',
    slug: 'linear',
    description: '',
    enabled: true,
    transport: 'http',
    auth: 'oauth',
    oauth: { clientId: '', clientSecret: '', scope: '' },
    url: MCP_URL,
    command: '',
    args: [],
    headers: [],
    env: [],
    confirmations: {},
    ...over,
  })

async function authorizeUrl(id: string, origin = 'https://opex.exemplo.com') {
  const started = await startMcpOauth(id, origin, 'local')
  const url = new URL(started.url)
  as.challenge = url.searchParams.get('code_challenge')
  return url
}

type StoredDoc = { oauth: IOpexMcpOauth & { pending: IOpexMcpOauthPending } }
const docOf = (id: string) => servers().docs.find((doc) => String(doc._id) === id) as unknown as StoredDoc

beforeEach(() => {
  process.env.INTEGRATIONS_ENCRYPTION_KEY = KEY
  holder.servers = createFakeCollection(() => ({ tools: [], toolsSyncedAt: null, lastError: null, lastCheckedAt: null, confirmations: {} }))
  holder.audit = []
  holder.events = []
  as = { registered: [], tokenRequests: [], revoked: [], challenge: null, grantedScope: undefined, refreshOk: true, counter: 0, revocationEndpoint: 'https://auth.test/revoke', calls: [] }
  vi.stubGlobal('fetch', vi.fn(fakeFetch))
  // A `@ai-sdk/mcp` usa no Node um fetch próprio com DNS validado (anti-SSRF); fora do Node ela usa o
  // `fetch` global — o simulado aqui. Só no teste: a produção mantém a proteção.
  vi.stubGlobal('EdgeRuntime', 'vitest')
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.INTEGRATIONS_ENCRYPTION_KEY
})

describe('OAuth dos MCPs do Agente Opex', () => {
  it('Autorizar: registra o cliente, usa PKCE S256 e o retorno na origem pública', async () => {
    const server = await createMcpServer(baseInput(), 'local')
    expect(server.auth).toBe('oauth')
    expect(server.oauth?.status).toBe('not_authorized')
    const url = await authorizeUrl(server.id)
    expect(url.origin + url.pathname).toBe('https://auth.test/authorize')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('redirect_uri')).toBe('https://opex.exemplo.com/api/opex/mcp-servers/oauth/callback')
    expect(url.searchParams.get('client_id')).toBe('dyn-1')
    expect(as.registered[0]?.redirect_uris).toEqual(['https://opex.exemplo.com/api/opex/mcp-servers/oauth/callback'])
    const stored = docOf(server.id).oauth
    expect(stored.pending.stateHash).toMatch(/^[a-f0-9]{64}$/)
    // State e verificador ficam cifrados (nunca em texto puro no banco).
    expect(JSON.stringify(stored)).not.toContain(url.searchParams.get('state')!)
  })

  it('retorno com o state certo troca o código, grava tokens cifrados e não os devolve no DTO', async () => {
    const server = await createMcpServer(baseInput(), 'local')
    const url = await authorizeUrl(server.id)
    const result = await finishMcpOauth({ state: url.searchParams.get('state'), code: 'codigo-bom', error: null, errorDescription: null, iss: null }, 'local')
    expect(result.ok).toBe(true)
    expect(result.redirectTo).toBe('https://opex.exemplo.com/integracoes/ia?aba=agente-opex&secao=mcps&oauth=ok&mcp=' + server.id)
    const doc = docOf(server.id)
    expect(doc.oauth.status).toBe('authorized')
    expect(doc.oauth.pending).toBeNull()
    expect(JSON.stringify(doc)).not.toContain('at-1')
    const dto = await getMcpServer(server.id)
    expect(dto.oauth?.status).toBe('authorized')
    expect(dto.oauth?.dynamicClient).toBe(true)
    expect(JSON.stringify(dto)).not.toMatch(/at-1|rt-1|dyn-1/)
    expect(JSON.stringify(holder.audit)).not.toMatch(/at-1|rt-1|codigo-bom/)
    expect(holder.events).toContainEqual(['opex-mcp-updated', { id: server.id }])
  })

  it('recusa state desconhecido, reaproveitado ou expirado sem gravar token', async () => {
    const server = await createMcpServer(baseInput(), 'local')
    const url = await authorizeUrl(server.id)
    const state = url.searchParams.get('state')
    expect((await finishMcpOauth({ state: 'outro', code: 'codigo-bom', error: null, errorDescription: null, iss: null }, 'local')).ok).toBe(false)
    expect((await finishMcpOauth({ state, code: 'codigo-bom', error: null, errorDescription: null, iss: null }, 'local')).ok).toBe(true)
    const again = await finishMcpOauth({ state, code: 'codigo-bom', error: null, errorDescription: null, iss: null }, 'local')
    expect(again.ok).toBe(false)
    expect(as.tokenRequests).toHaveLength(1)

    const url2 = await authorizeUrl(server.id)
    docOf(server.id).oauth.pending.expiresAt = new Date(Date.now() - 1000)
    const expired = await finishMcpOauth({ state: url2.searchParams.get('state'), code: 'codigo-bom', error: null, errorDescription: null, iss: null }, 'local')
    expect(expired.ok).toBe(false)
    expect(expired.message).toMatch(/expirou/)
    expect(as.tokenRequests).toHaveLength(1)
  })

  it('escopo concedido menor que o pedido: revoga o token, não grava e cita a permissão faltante', async () => {
    const server = await createMcpServer(baseInput({ oauth: { clientId: '', clientSecret: '', scope: 'read write' } }), 'local')
    as.grantedScope = 'read'
    const url = await authorizeUrl(server.id)
    expect(url.searchParams.get('scope')).toBe('read write')
    const result = await finishMcpOauth({ state: url.searchParams.get('state'), code: 'codigo-bom', error: null, errorDescription: null, iss: null }, 'local')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('write')
    expect(docOf(server.id).oauth.tokens).toBeNull()
    expect(docOf(server.id).oauth.status).toBe('error')
    expect(as.revoked).toEqual(expect.arrayContaining(['rt-1', 'at-1']))
    expect(missingScopes('read write', 'read write extra')).toEqual([])
  })

  it('sem token, a conexão do turno marca "precisa autorizar" e falha como erro de autorização', async () => {
    const server = await createMcpServer(baseInput(), 'local')
    const doc = docOf(server.id)
    const error = await connectMcp({ transport: 'http', url: MCP_URL, command: '', args: [], headers: {}, env: {}, oauth: { serverId: server.id, state: doc.oauth } }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(OpexMcpAuthRequiredError)
    expect(isMcpAuthError(error)).toBe(true)
    expect(docOf(server.id).oauth.status).toBe('needs_auth')
    const test = await testMcpConnection({ ...baseInput(), id: server.id })
    expect(test).toMatchObject({ ok: false, authRequired: true })
  })

  it('renovação: refresh_token gera token novo com a geração incrementada; recusa marca "precisa autorizar"', async () => {
    const server = await createMcpServer(baseInput(), 'local')
    const url = await authorizeUrl(server.id)
    await finishMcpOauth({ state: url.searchParams.get('state'), code: 'codigo-bom', error: null, errorDescription: null, iss: null }, 'local')
    const before = docOf(server.id).oauth.tokenVersion
    const headless = createMcpOauthProvider(server.id, { ...docOf(server.id).oauth }, { mode: 'headless' })
    expect(await auth(headless, { serverUrl: MCP_URL })).toBe('AUTHORIZED')
    expect(as.tokenRequests.at(-1)?.get('grant_type')).toBe('refresh_token')
    expect(docOf(server.id).oauth.tokenVersion).toBe(before + 1)

    as.refreshOk = false
    const stale = createMcpOauthProvider(server.id, { ...docOf(server.id).oauth }, { mode: 'headless' })
    await expect(auth(stale, { serverUrl: MCP_URL })).rejects.toBeInstanceOf(OpexMcpAuthRequiredError)
    expect(docOf(server.id).oauth.status).toBe('needs_auth')
    expect(docOf(server.id).oauth.tokens).toBeNull()
  })

  it('desconectar revoga no provedor e apaga tokens e cliente dinâmico', async () => {
    const server = await createMcpServer(baseInput(), 'local')
    const url = await authorizeUrl(server.id)
    await finishMcpOauth({ state: url.searchParams.get('state'), code: 'codigo-bom', error: null, errorDescription: null, iss: null }, 'local')
    expect(await disconnectMcpOauth(server.id, 'local')).toEqual({ revoked: true })
    expect(as.revoked).toEqual(expect.arrayContaining(['rt-1', 'at-1']))
    const doc = docOf(server.id).oauth
    expect(doc).toMatchObject({ tokens: null, client: null, status: 'not_authorized' })
  })

  it('desconectar não envia tokens a endpoint de revogação interno ou sem https (anti-SSRF)', async () => {
    for (const endpoint of ['http://10.0.0.5:8080/admin', 'https://10.0.0.5/revoke', 'https://localhost/revoke', 'file:///etc/passwd']) {
      as.revocationEndpoint = endpoint
      const server = await createMcpServer(baseInput({ slug: `linear_${as.revocationEndpoint.length}` }), 'local')
      const url = await authorizeUrl(server.id)
      await finishMcpOauth({ state: url.searchParams.get('state'), code: 'codigo-bom', error: null, errorDescription: null, iss: null }, 'local')
      as.calls = []
      expect(await disconnectMcpOauth(server.id, 'local')).toEqual({ revoked: false })
      expect(as.calls.filter((call) => call.startsWith('POST'))).toEqual([])
      expect(as.revoked).toEqual([])
      expect(docOf(server.id).oauth).toMatchObject({ tokens: null, status: 'not_authorized' })
    }
  })

  it('trocar para cabeçalhos revoga e apaga os tokens; excluir também revoga', async () => {
    const server = await createMcpServer(baseInput(), 'local')
    const url = await authorizeUrl(server.id)
    await finishMcpOauth({ state: url.searchParams.get('state'), code: 'codigo-bom', error: null, errorDescription: null, iss: null }, 'local')
    const dto = await updateMcpServer(server.id, baseInput({ auth: 'headers', headers: [{ key: 'Authorization', value: 'Bearer fixo' }] }), 'local')
    expect(dto.auth).toBe('headers')
    expect(as.revoked).toEqual(expect.arrayContaining(['rt-1', 'at-1']))
    expect(docOf(server.id).oauth).toMatchObject({ tokens: null, status: 'not_authorized' })

    const other = await createMcpServer(baseInput({ slug: 'linear_2' }), 'local')
    const url2 = await authorizeUrl(other.id)
    await finishMcpOauth({ state: url2.searchParams.get('state'), code: 'codigo-bom', error: null, errorDescription: null, iss: null }, 'local')
    as.revoked = []
    await deleteMcpServer(other.id, 'local')
    expect(as.revoked.length).toBeGreaterThan(0)
  })

  it('regressão: sair do OAuth com cabeçalho inválido recusa a edição e mantém a autorização', async () => {
    const server = await createMcpServer(baseInput(), 'local')
    const url = await authorizeUrl(server.id)
    await finishMcpOauth({ state: url.searchParams.get('state'), code: 'codigo-bom', error: null, errorDescription: null, iss: null }, 'local')
    await expect(updateMcpServer(server.id, baseInput({ auth: 'headers', headers: [{ key: 'X-Api-Key', value: '' }] }), 'local')).rejects.toMatchObject({ code: 'OPEX_MCP_SECRET_REQUIRED' })
    expect(as.revoked).toEqual([])
    const doc = docOf(server.id)
    expect(doc.oauth.status).toBe('authorized')
    expect(doc.oauth.tokens).not.toBeNull()
    expect((await getMcpServer(server.id)).auth).toBe('oauth')
  })

  it('trocar a URL ou o client id invalida a autorização; editar sem mudar mantém', async () => {
    const server = await createMcpServer(baseInput(), 'local')
    const url = await authorizeUrl(server.id)
    await finishMcpOauth({ state: url.searchParams.get('state'), code: 'codigo-bom', error: null, errorDescription: null, iss: null }, 'local')
    await updateMcpServer(server.id, baseInput({ description: 'novo' }), 'local')
    expect(docOf(server.id).oauth.status).toBe('authorized')
    await updateMcpServer(server.id, baseInput({ url: 'https://mcp.test/v2/mcp' }), 'local')
    expect(docOf(server.id).oauth).toMatchObject({ tokens: null, client: null, status: 'not_authorized' })
    const merged = mergeMcpOauth({ clientId: 'pre', clientSecret: 's3', scope: '' }, docOf(server.id).oauth, false)
    expect(merged.clientId).toBe('pre')
    expect(JSON.stringify(merged.clientSecret)).not.toContain('s3')
  })

  it('regressão: editar o formulário não devolve ao banco um token renovado por um turno no meio do salvamento', async () => {
    const server = await createMcpServer(baseInput(), 'local')
    const url = await authorizeUrl(server.id)
    await finishMcpOauth({ state: url.searchParams.get('state'), code: 'codigo-bom', error: null, errorDescription: null, iss: null }, 'local')
    const collection = servers()
    const original = collection.updateOne.bind(collection)
    // Um turno renova o token entre a leitura do formulário e a gravação.
    const renewDuringSave = async () => {
      const headless = createMcpOauthProvider(server.id, { ...docOf(server.id).oauth }, { mode: 'headless' })
      await auth(headless, { serverUrl: MCP_URL })
    }
    let renewed = false
    collection.updateOne = (async (filter: Record<string, unknown>, update: Record<string, unknown>, ...rest: unknown[]) => {
      if (!renewed && !Object.keys(filter).some((key) => key.startsWith('oauth'))) {
        renewed = true
        await renewDuringSave()
      }
      return (original as (...args: unknown[]) => Promise<unknown>)(filter, update, ...rest)
    }) as typeof collection.updateOne
    const renewedVersion = async () => docOf(server.id).oauth.tokenVersion
    await updateMcpServer(server.id, baseInput({ description: 'editado', oauth: { clientId: '', clientSecret: '', scope: 'read' } }), 'local')
    const doc = docOf(server.id)
    expect(renewed).toBe(true)
    expect(doc.oauth.status).toBe('authorized')
    expect(doc.oauth.scope).toBe('read')
    expect(doc.oauth.tokenVersion).toBe(await renewedVersion())
    // O token gravado é o da renovação (rt-2), não o lido antes do salvamento (rt-1).
    const provider = createMcpOauthProvider(server.id, { ...doc.oauth }, { mode: 'headless' })
    expect((await provider.tokens())?.refresh_token).toBe('rt-2')

    // Invalidação (URL nova) continua valendo mesmo com renovação concorrente.
    renewed = false
    await updateMcpServer(server.id, baseInput({ url: 'https://mcp.test/v3/mcp' }), 'local')
    expect(renewed).toBe(true)
    expect(docOf(server.id).oauth).toMatchObject({ tokens: null, status: 'not_authorized' })
  })

  it('schema: OAuth proíbe o cabeçalho Authorization (vem do token) e é ignorado no stdio', () => {
    expect(opexMcpServerInputSchema.safeParse({ ...baseInput(), headers: [{ key: 'Authorization', value: 'x' }] }).success).toBe(false)
    expect(opexMcpServerInputSchema.safeParse({ ...baseInput(), headers: [{ key: 'X-Workspace', value: 'x' }] }).success).toBe(true)
    expect(opexMcpServerInputSchema.safeParse({ ...baseInput(), auth: 'headers', headers: [{ key: 'Authorization', value: 'x' }] }).success).toBe(true)
  })
})

describe('rotas do OAuth dos MCPs (origem pública)', () => {
  it('Autorizar monta o retorno com a origem do navegador, não com o endereço interno do processo', async () => {
    const server = await createMcpServer(baseInput(), 'local')
    const req = new NextRequest(`http://0.0.0.0:3100/api/opex/mcp-servers/${server.id}/oauth`, { method: 'POST', headers: { origin: 'https://opex.publico.dev', host: '0.0.0.0:3100' } })
    const res = await startRoute(req, { params: Promise.resolve({ id: server.id }) })
    const body = (await res.json()) as { data: { url: string } }
    const redirect = new URL(body.data.url).searchParams.get('redirect_uri')
    expect(redirect).toBe('https://opex.publico.dev/api/opex/mcp-servers/oauth/callback')
    expect(redirect).not.toContain('0.0.0.0')
  })

  it('retorno conclui e volta para a seção MCPs na origem pública do pedido', async () => {
    const server = await createMcpServer(baseInput(), 'local')
    const url = await authorizeUrl(server.id, 'https://opex.publico.dev')
    const req = new NextRequest(`http://0.0.0.0:3100/api/opex/mcp-servers/oauth/callback?code=codigo-bom&state=${encodeURIComponent(url.searchParams.get('state')!)}`, { headers: { host: '0.0.0.0:3100' } })
    const res = await callbackRoute(req)
    expect(res.status).toBe(303)
    const location = new URL(res.headers.get('location')!)
    expect(location.origin).toBe('https://opex.publico.dev')
    expect(location.searchParams.get('oauth')).toBe('ok')
  })

  it('retorno sem a sessão do dono é recusado: não troca o código nem grava token', async () => {
    const server = await createMcpServer(baseInput(), 'local')
    const url = await authorizeUrl(server.id, 'https://opex.publico.dev')
    const { DomainError } = await import('@/lib/api/route')
    vi.mocked(requireAdminSession).mockRejectedValueOnce(new DomainError(401, 'Sessão ausente ou expirada.', 'UNAUTHENTICATED'))
    const req = new NextRequest(`http://0.0.0.0:3100/api/opex/mcp-servers/oauth/callback?code=codigo-bom&state=${encodeURIComponent(url.searchParams.get('state')!)}`, { headers: { 'x-forwarded-host': 'opex.publico.dev', 'x-forwarded-proto': 'https' } })
    const res = await callbackRoute(req)
    const location = new URL(res.headers.get('location')!)
    expect(location.searchParams.get('oauth')).toBe('erro')
    expect(as.tokenRequests).toHaveLength(0)
    expect(docOf(server.id).oauth.tokens).toBeNull()
    // O pedido continua intacto (não foi consumido por quem não tem a sessão).
    expect(docOf(server.id).oauth.pending).not.toBeNull()
  })

  it('retorno inválido volta com erro e mensagem, sem gravar token', async () => {
    const req = new NextRequest('http://0.0.0.0:3100/api/opex/mcp-servers/oauth/callback?code=x&state=nada', { headers: { 'x-forwarded-host': 'opex.publico.dev', 'x-forwarded-proto': 'https' } })
    const res = await callbackRoute(req)
    const location = new URL(res.headers.get('location')!)
    expect(location.origin).toBe('https://opex.publico.dev')
    expect(location.searchParams.get('oauth')).toBe('erro')
    expect(location.searchParams.get('mensagem')).toMatch(/não encontrado/)
  })
})
