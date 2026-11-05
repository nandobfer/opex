import { toEngramindError } from '@/features/engramind/server/errors'

/**
 * Engramind em memória para os testes das memórias dos agentes (OPE-104): implementa o `engramindCall`
 * nas rotas que o Opex usa (configurações, canais, memórias, importação idempotente, agentes,
 * assinaturas, tokens e contexto). Nunca há rede.
 */

export interface FakeMemory {
  id: string
  channel: string
  channel_id: string
  title: string | null
  title_state: 'pending' | 'ready' | 'fallback'
  text: string
  category: string
  status: 'active' | 'permanent' | 'archived'
  version: number
  author: { app: string | null; app_id: string | null; agent: string | null; agent_id: string | null }
  origin: { source: string; label?: string | null } | null
  embedding_state: 'ready'
  retrieval_count: number
  created_at: string
  updated_at: string
  archived_at: string | null
}

export interface FakeCall {
  method: string
  path: string
  query?: Record<string, unknown>
  body?: unknown
  token: string | null
  idempotencyKey?: string
}

const fail = (status: number, code: string, details?: Record<string, unknown>) => toEngramindError(status, { code, message: code, details } as never)

/**
 * Rotas do contrato publicado pelo Engramind (`~/code/engramind/docs/openapi.json`, v0.11.0) que este fake
 * implementa. Chamada fora da lista responde 405 `METHOD_NOT_ALLOWED`, como o serviço real: o fake nunca
 * aceita rota inventada. Rota nova aqui exige conferir método e caminho no contrato antes.
 */
export const CONTRACT_ROUTES: readonly (readonly [string, string])[] = [
  ['GET', '/v1/settings'],
  ['GET', '/v1/context'],
  ['GET', '/v1/channels'],
  ['POST', '/v1/channels'],
  ['GET', '/v1/channels/{channel}'],
  ['GET', '/v1/channels/{channel}/settings'],
  ['POST', '/v1/channels/{channel}/archive'],
  ['POST', '/v1/channels/{channel}/restore'],
  ['GET', '/v1/memories'],
  ['POST', '/v1/memories'],
  ['POST', '/v1/memories/import'],
  ['GET', '/v1/memories/{memory}'],
  ['PATCH', '/v1/memories/{memory}'],
  ['DELETE', '/v1/memories/{memory}'],
  ['POST', '/v1/memories/{memory}/pin'],
  ['POST', '/v1/memories/{memory}/unpin'],
  ['POST', '/v1/memories/{memory}/archive'],
  ['POST', '/v1/memories/{memory}/restore'],
  ['POST', '/v1/memories/{memory}/move'],
  ['POST', '/v1/agents'],
  ['GET', '/v1/agents/{agent}'],
  ['GET', '/v1/subscriptions'],
  ['POST', '/v1/subscriptions'],
  ['GET', '/v1/tokens'],
  ['POST', '/v1/tokens'],
  ['POST', '/v1/tokens/{token}/revoke'],
  ['POST', '/v1/tokens/{token}/rotate'],
  ['GET', '/v1/whoami'],
  ['POST', '/v1/hints'],
  ['POST', '/v1/memories/search'],
  ['POST', '/v1/consolidation/run'],
  ['POST', '/v1/embeddings/reembed'],
]
const CONTRACT_PATTERNS = CONTRACT_ROUTES.map(([method, template]) => ({ method, pattern: new RegExp(`^${template.replace(/\{[^}]+\}/g, '[^/]+')}$`) }))
const inContract = (method: string, path: string) => CONTRACT_PATTERNS.some((route) => route.method === method && route.pattern.test(path))

export function createFakeEngramind() {
  const state = {
    seq: 0,
    clock: Date.parse('2026-11-01T10:00:00Z'),
    settings: { 'memory.text_min': 3, 'memory.text_max': 4000, 'limits.max_batch': 100, 'context.budget_tokens': 4000, 'categories.list': [{ key: 'PROJECT_RULES', label: 'Regras', priority: 10 }, { key: 'NAMING', label: 'Nomes', priority: 5 }] } as Record<string, unknown>,
    channels: new Map<string, { slug: string; archived_at: string | null }>(),
    memories: new Map<string, FakeMemory>(),
    agents: new Map<string, { slug: string; disabled_at: string | null }>(),
    subscriptions: [] as { agent: string; target: string; mode: string }[],
    tokens: new Map<string, { id: string; prefix: string; status: 'active' | 'expired' | 'revoked'; agent: string | null; scopes: string[]; kind?: 'agent' | 'app' | 'admin' }>(),
    imports: new Map<string, unknown>(),
    context: { content: '', version: 'cv_1', counts: { full: 0, titles: 0, overflow: 0 } },
    contextFails: false,
    /** Engramind anterior à 0.11.0: `focus` desconhecido → 400 `VALIDATION_ERROR`. */
    contextRejectsFocus: false,
    /** Sem embeddings: `get_hints` vem vazio (contrato 0.11.0). */
    embeddingsOff: false,
    /** `focus_mode` devolvido quando há foco (padrão `hybrid`). */
    focusMode: 'hybrid' as 'hybrid' | 'text' | 'none',
    hintsFail: false,
    calls: [] as FakeCall[],
  }
  const now = () => new Date((state.clock += 1000)).toISOString()
  const tokenOf = (token: string | null) => token
  const agentOfToken = (token: string | null) => [...state.tokens.values()].find((item) => token?.includes(item.id))?.agent ?? null

  function createMemory(channel: string, body: { text: string; category?: string; origin?: FakeMemory['origin']; status?: string; created_at?: string }, token: string | null): { memory: FakeMemory; duplicate: boolean } {
    const ch = state.channels.get(channel)
    if (!ch) throw fail(404, 'CHANNEL_NOT_FOUND', { channel })
    if (ch.archived_at) throw fail(409, 'CHANNEL_ARCHIVED')
    const existing = [...state.memories.values()].find((item) => item.channel === channel && item.text.trim().toLowerCase() === body.text.trim().toLowerCase())
    if (existing) return { memory: existing, duplicate: true }
    const id = `m_${(++state.seq).toString(16).padStart(6, '0')}`
    const at = body.created_at ?? now()
    const agent = agentOfToken(token)
    const memory: FakeMemory = {
      id,
      channel,
      channel_id: `ch_${channel.replace(/\W/g, '')}`,
      title: null,
      title_state: 'pending',
      text: body.text,
      category: body.category ?? (state.settings['categories.list'] as { key: string }[])[0]!.key,
      status: body.status === 'permanent' ? 'permanent' : 'active',
      version: 1,
      author: { app: 'opex', app_id: 'app_opex', agent, agent_id: agent ? `ag_${agent}` : null },
      origin: body.origin ?? null,
      embedding_state: 'ready',
      retrieval_count: 0,
      created_at: at,
      updated_at: at,
      archived_at: null,
    }
    state.memories.set(id, memory)
    return { memory, duplicate: false }
  }

  function getMemory(id: string): FakeMemory {
    const memory = state.memories.get(id)
    if (!memory) throw fail(404, 'MEMORY_NOT_FOUND')
    return memory
  }

  function bump(memory: FakeMemory, change: Partial<FakeMemory>): FakeMemory {
    Object.assign(memory, change, { version: memory.version + 1, updated_at: now() })
    return memory
  }

  async function engramindCall(method: string, request: { path: string; query?: Record<string, unknown>; body?: unknown }, options: { target?: { token: string }; idempotencyKey?: string } = {}): Promise<unknown> {
    const token = options.target?.token ?? null
    state.calls.push({ method, path: request.path, query: request.query, body: request.body, token: tokenOf(token), idempotencyKey: options.idempotencyKey })
    const path = request.path
    if (!inContract(method, path)) throw fail(405, 'METHOD_NOT_ALLOWED', { method, path })
    const body = (request.body ?? {}) as Record<string, unknown>
    const seg = (prefix: string) => decodeURIComponent(path.slice(prefix.length))

    if (method === 'GET' && path === '/v1/settings') return { settings: Object.entries(state.settings).map(([key, value]) => ({ key, value })) }
    if (method === 'GET' && /^\/v1\/channels\/.+\/settings$/.test(path)) {
      const slug = decodeURIComponent(path.slice('/v1/channels/'.length, -'/settings'.length))
      if (!state.channels.has(slug)) throw fail(404, 'CHANNEL_NOT_FOUND')
      return { channel: slug, settings: [] }
    }
    if (method === 'GET' && path === '/v1/channels') {
      // Lista (agentes rotineiros, OPE-130: o subagente de provisionamento escolhe os canais extras).
      return { channels: [...state.channels.values()].map((item) => ({ id: `ch_${item.slug}`, slug: item.slug, name: item.slug, description: null, archived_at: item.archived_at })), next_cursor: null }
    }
    if (method === 'POST' && path === '/v1/channels') {
      if (state.channels.has(String(body.slug))) throw fail(409, 'SLUG_ALREADY_EXISTS')
      state.channels.set(String(body.slug), { slug: String(body.slug), archived_at: null })
      return { slug: body.slug }
    }
    if (method === 'POST' && /^\/v1\/channels\/.+\/(archive|restore)$/.test(path)) {
      const action = path.endsWith('/archive') ? 'archive' : 'restore'
      const slug = decodeURIComponent(path.slice('/v1/channels/'.length, -(action.length + 1)))
      const channel = state.channels.get(slug)
      if (!channel) throw fail(404, 'CHANNEL_NOT_FOUND')
      channel.archived_at = action === 'archive' ? now() : null
      return { slug, archived_at: channel.archived_at }
    }
    if (method === 'GET' && path.startsWith('/v1/channels/')) {
      const channel = state.channels.get(seg('/v1/channels/'))
      if (!channel) throw fail(404, 'CHANNEL_NOT_FOUND')
      return { id: `ch_${channel.slug}`, slug: channel.slug, archived_at: channel.archived_at }
    }
    if (method === 'GET' && path === '/v1/memories') {
      const channels = String(request.query?.channels ?? '').split(',')
      const statuses = String(request.query?.status ?? 'active,permanent').split(',')
      const memories = [...state.memories.values()].filter((item) => channels.includes(item.channel) && statuses.includes(item.status)).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      return { memories: memories.map((item) => ({ ...item })), next_cursor: null }
    }
    if (method === 'POST' && path === '/v1/memories/import') {
      if (options.idempotencyKey && state.imports.has(options.idempotencyKey)) return state.imports.get(options.idempotencyKey)
      const items = body.memories as { text: string; category?: string; origin?: FakeMemory['origin']; status?: string; created_at?: string }[]
      if (items.length > Number(state.settings['limits.max_batch'])) throw fail(400, 'BATCH_TOO_LARGE')
      const created: { index: number; id: string }[] = []
      const duplicates: { index: number; existing_id: string }[] = []
      items.forEach((item, index) => {
        const result = createMemory(String(body.channel), item, token)
        if (result.duplicate) duplicates.push({ index, existing_id: result.memory.id })
        else created.push({ index, id: result.memory.id })
      })
      const response = { created, duplicates }
      if (options.idempotencyKey) state.imports.set(options.idempotencyKey, response)
      return response
    }
    if (method === 'POST' && path === '/v1/memories/search') {
      const query = String(body.query ?? '').toLowerCase()
      const channels = Array.isArray(body.channels) ? (body.channels as string[]) : null
      const limit = Number(body.limit ?? 10)
      const results = [...state.memories.values()]
        .filter((item) => item.status !== 'archived' && (!channels || channels.includes(item.channel)) && query.split(/\s+/).some((term) => term && item.text.toLowerCase().includes(term)))
        .slice(0, limit)
        .map((memory, index) => ({ rank: index + 1, score: 0.5, memory: { ...memory } }))
      return { mode: 'text', results, context_version: state.context.version }
    }
    if (method === 'POST' && path === '/v1/hints') {
      if (state.hintsFail) throw toEngramindError(503, null)
      const text = String(body.text ?? '')
      if (!text || text.length > 2000) throw fail(400, 'VALIDATION_ERROR')
      if (state.embeddingsOff) return { hints: [] }
      const channels = Array.isArray(body.channels) ? (body.channels as string[]) : null
      const terms = text.toLowerCase().split(/\s+/).filter(Boolean)
      const hints = [...state.memories.values()]
        .filter((item) => item.status !== 'archived' && (!channels || channels.includes(item.channel)) && terms.some((term) => item.text.toLowerCase().includes(term)))
        .slice(0, Number(body.limit ?? 5))
        .map((item) => ({ id: item.id, title: item.title ?? item.text.slice(0, 40), channel: item.channel, score: 0.8, method: 'vector', duplicate: false }))
      return { hints }
    }
    if (method === 'POST' && path === '/v1/consolidation/run') {
      const channel = typeof body.channel === 'string' ? body.channel : null
      const enabled = [...state.channels.values()].filter((item) => !item.archived_at).map((item) => item.slug)
      const targets = channel ? [channel] : enabled
      if (body.dry_run === true) return { dry_run: true, channels: targets.map((slug) => ({ channel: slug, skipped: {}, duplicates: [], classify: [], stale: { flag: [], clear: [], archive: [] } })), jobs: [] }
      return { dry_run: false, channels: [], jobs: targets.map((slug, index) => ({ channel: slug, job_id: 100 + index, already_queued: false })) }
    }
    if (method === 'POST' && path === '/v1/embeddings/reembed') return { model_id: 'm1', started_at: now(), total: state.memories.size }
    if (method === 'POST' && path === '/v1/memories') {
      const result = createMemory(String(body.channel), body as never, token)
      return { memory: { ...result.memory }, duplicate: result.duplicate, similar: [] }
    }
    const memoryAction = /^\/v1\/memories\/([^/]+)\/(pin|unpin|archive|restore)$/.exec(path)
    if (method === 'POST' && memoryAction) {
      const memory = getMemory(decodeURIComponent(memoryAction[1]!))
      const next = { pin: 'permanent', unpin: 'active', archive: 'archived', restore: 'active' }[memoryAction[2] as 'pin'] as FakeMemory['status']
      return { ...bump(memory, { status: next, archived_at: next === 'archived' ? now() : null }) }
    }
    const memoryMove = /^\/v1\/memories\/([^/]+)\/move$/.exec(path)
    if (method === 'POST' && memoryMove) {
      const memory = getMemory(decodeURIComponent(memoryMove[1]!))
      const channel = String(body.to)
      const target = state.channels.get(channel)
      if (!target) throw fail(404, 'CHANNEL_NOT_FOUND', { channel })
      if (target.archived_at) throw fail(409, 'CHANNEL_ARCHIVED', { channel })
      const duplicate = [...state.memories.values()].find((item) => item.id !== memory.id && item.channel === channel && item.text.trim().toLowerCase() === memory.text.trim().toLowerCase())
      if (duplicate) throw fail(409, 'MEMORY_DUPLICATE', { existing_id: duplicate.id })
      return { ...bump(memory, { channel, channel_id: `ch_${channel.replace(/\W/g, '')}` }) }
    }
    if (path.startsWith('/v1/memories/')) {
      const id = seg('/v1/memories/')
      if (method === 'GET') return { ...getMemory(id) }
      if (method === 'DELETE') {
        const memory = getMemory(id)
        state.memories.delete(id)
        return memory
      }
      if (method === 'PATCH') {
        const memory = getMemory(id)
        if (body.expected_version !== undefined && body.expected_version !== memory.version) throw fail(409, 'MEMORY_VERSION_CONFLICT', { current_version: memory.version })
        const change: Partial<FakeMemory> = {}
        if (typeof body.text === 'string') Object.assign(change, { text: body.text, title_state: 'pending', title: null })
        if (typeof body.category === 'string') change.category = body.category
        return { memory: { ...bump(memory, change) }, duplicate: false, similar: [] }
      }
    }
    if (method === 'GET' && path.startsWith('/v1/agents/')) {
      const agent = state.agents.get(seg('/v1/agents/'))
      if (!agent) throw fail(404, 'AGENT_NOT_FOUND')
      return { slug: agent.slug, disabled_at: agent.disabled_at }
    }
    if (method === 'POST' && path === '/v1/agents') {
      // Idempotência natural (0.11.0): repetição equivalente devolve o existente com `created: false`.
      if (state.agents.has(`${body.app}/${body.slug}`)) return { slug: body.slug, created: false }
      state.agents.set(`${body.app}/${body.slug}`, { slug: String(body.slug), disabled_at: null })
      return { slug: body.slug, created: true }
    }
    if (method === 'GET' && path === '/v1/subscriptions') return { subscriptions: state.subscriptions.filter((item) => item.agent === request.query?.agent).map((item) => ({ target: item.target })) }
    if (method === 'POST' && path === '/v1/subscriptions') {
      const existing = state.subscriptions.find((item) => item.agent === body.agent && item.target === body.target)
      if (existing && existing.mode === String(body.mode)) return { created: false }
      if (existing) throw fail(409, 'SUBSCRIPTION_EXISTS')
      state.subscriptions.push({ agent: String(body.agent), target: String(body.target), mode: String(body.mode) })
      // Alvo exato inexistente cria o canal (decisão 0033).
      const target = String(body.target)
      const createdChannel = !target.endsWith('*') && !state.channels.has(target)
      if (createdChannel) state.channels.set(target, { slug: target, archived_at: null })
      return { created: true, channel_created: createdChannel }
    }
    if (method === 'POST' && path === '/v1/tokens') {
      const id = `tk_${(++state.seq).toString(16).padStart(6, '0')}`
      const kind = (typeof body.kind === 'string' ? body.kind : 'agent') as 'agent' | 'app' | 'admin'
      state.tokens.set(id, { id, prefix: `eng.${id}`, status: 'active', agent: kind === 'agent' ? (String(body.agent ?? '').split('/').pop() ?? null) : null, scopes: Array.isArray(body.scopes) ? body.scopes.map(String) : [], kind })
      return { token: { id, prefix: `eng.${id}`, status: 'active', kind }, secret: `eng.${id}.segredo` }
    }
    if (method === 'GET' && path === '/v1/tokens') {
      // Contrato: lista paginada (`{ tokens, next_cursor }`), filtrada por `agent` (`app/agente`); não há leitura por id.
      const agent = request.query?.agent ? String(request.query.agent).split('/').pop() : null
      const rows = [...state.tokens.values()].filter((item) => !agent || item.agent === agent)
      const limit = Math.min(Number(request.query?.limit ?? 50), 200)
      const start = request.query?.cursor ? Number(request.query.cursor) : 0
      const page = rows.slice(start, start + limit)
      return {
        tokens: page.map((item) => ({ id: item.id, prefix: item.prefix, kind: 'agent', scopes: [...item.scopes], status: item.status, app: { slug: 'opex' }, agent: item.agent ? { slug: item.agent } : null, label: null, created_at: '2026-11-01T10:00:00.000Z', expires_at: null, revoked_at: item.status === 'revoked' ? '2026-11-01T10:00:00.000Z' : null, last_used_at: null })),
        next_cursor: start + limit < rows.length ? String(start + limit) : null,
      }
    }
    if (method === 'POST' && /^\/v1\/tokens\/.+\/revoke$/.test(path)) {
      const tokenRow = state.tokens.get(decodeURIComponent(path.slice('/v1/tokens/'.length, -'/revoke'.length)))
      if (tokenRow) tokenRow.status = 'revoked'
      return tokenRow ?? null
    }
    if (method === 'POST' && /^\/v1\/tokens\/.+\/rotate$/.test(path)) {
      const old = state.tokens.get(decodeURIComponent(path.slice('/v1/tokens/'.length, -'/rotate'.length)))
      if (!old) throw fail(404, 'TOKEN_NOT_FOUND')
      if (old.status !== 'active') throw fail(400, 'TOKEN_NOT_ACTIVE')
      old.status = 'revoked'
      const id = `tk_${(++state.seq).toString(16).padStart(6, '0')}`
      state.tokens.set(id, { ...old, id, prefix: `eng.${id}`, status: 'active' })
      return { token: { id, prefix: `eng.${id}`, status: 'active' }, secret: `eng.${id}.segredo` }
    }
    if (method === 'GET' && path === '/v1/whoami') {
      const row = [...state.tokens.values()].find((item) => token?.includes(item.id))
      if (!row || row.status !== 'active') return { token_id: 'tk_admin', kind: 'admin', scopes: ['read', 'write', 'delete'], app: { id: 'app_opex', slug: 'opex' }, agent: null }
      return { token_id: row.id, kind: row.kind ?? 'agent', scopes: row.scopes, app: { id: 'app_opex', slug: 'opex' }, agent: row.agent ? { slug: row.agent } : null }
    }
    if (method === 'GET' && path === '/v1/context') {
      if (state.contextFails) throw toEngramindError(503, null)
      const query = (request.query ?? {}) as { format?: string; focus?: string }
      const focus = typeof query.focus === 'string' ? query.focus.replace(/\s+/g, ' ').trim() : ''
      if (focus && state.contextRejectsFocus) throw fail(400, 'VALIDATION_ERROR', { field: 'focus' })
      if (focus.length > 2000) throw fail(400, 'FOCUS_TOO_LONG')
      const version = focus ? `${state.context.version}_f${focus.length}` : state.context.version
      return { ...state.context, version, rendered_tokens: 10, format: query.format ?? 'markdown', focus_mode: focus ? state.focusMode : null }
    }
    throw fail(404, 'ROUTE_NOT_FOUND', { method, path })
  }

  return { state, engramindCall, createMemory }
}

export type FakeEngramind = ReturnType<typeof createFakeEngramind>
