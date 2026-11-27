import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Migração B (OPE-206): canais do dono de `agentes/...` para `opex/agentes/...`, com backup, manutenção, `move` de
 * todas as memórias, assinaturas recriadas, conferência antes de arquivar, retomada idempotente e volta atrás. Nada é
 * excluído (nenhum DELETE de memória ou canal).
 */

interface FakeChannel { slug: string; name: string; description: string | null; priority: number; archived_at: string | null }
interface FakeMemory { id: string; channel: string; status: string; text: string; key: string | null }
interface FakeSubscription { id: string; agent: { id: string; slug: string; qualified_slug: string }; target: string; mode: string; access: string[] | null; priority: number | null }

const h = vi.hoisted(() => ({
  channels: new Map<string, FakeChannel>(),
  memories: new Map<string, FakeMemory>(),
  subscriptions: [] as FakeSubscription[],
  settings: new Map<string, Record<string, unknown>>(),
  calls: [] as { method: string; path: string; key?: string; body?: unknown }[],
  moves: new Map<string, number>(),
  failMove: null as null | ((id: string) => boolean),
  tamperAfter: null as null | (() => void),
  afterBackup: null as null | (() => void),
  maintenanceAtExport: [] as number[],
  docs: new Map<string, Record<string, unknown>>(),
  prefixed: false,
  maintenance: [] as (string | null)[],
  naming: [] as string[],
  scriptPath: '/home/burgos/linux-scripts/export-engramind-memories.mjs' as string | null,
  exports: 0,
  seq: 0,
}))

vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined }))
vi.mock('@/lib/instance', () => ({ INSTANCE_ID: 'test-instance' }))
vi.mock('@/features/engramind/server/shared', () => ({ AcaoAuditoria: { EXECUTAR: 'EXECUTAR' }, auditEngramind: vi.fn(async () => undefined), engramindLog: { info: vi.fn(), warn: vi.fn() }, publishEngramind: vi.fn(async () => undefined) }))
vi.mock('@/features/engramind/server/connection', () => ({ requireUsableConnection: async () => ({}) }))
vi.mock('@/features/engramind/server/memory-network', () => ({ ensureAgentMemoryNetwork: vi.fn(async () => ({ step: { status: 'skipped' } })) }))
vi.mock('@/features/engramind/server/channel-migration/stored-slugs', () => ({ rewriteStoredSlugs: vi.fn(async () => ({ rotineiros: 0 })) }))
vi.mock('@/features/integrations/services/integration-service', () => ({ updateIntegration: vi.fn(async () => undefined) }))
vi.mock('@/features/engramind/server/instance', () => ({
  resetInstanceCache: () => undefined,
  channelNamespace: async () => ({ app: 'opex', prefixed: h.prefixed }),
  channelNamespaceOrLegacy: async () => ({ app: 'opex', prefixed: h.prefixed }),
  setChannelNaming: async (naming: string) => {
    h.naming.push(naming)
    h.prefixed = naming === 'prefixed'
  },
  setMemoryMaintenance: async (value: { migrationId: string } | null) => {
    h.maintenance.push(value ? value.migrationId : null)
  },
}))
vi.mock('@/features/engramind/server/channel-migration/host-export', async () => {
  const { createHash } = await import('node:crypto')
  return {
    EXPORT_ROOT: '/tmp/opex/engramind-migracao',
    exportScriptPath: async () => h.scriptPath,
    runHostExport: async (dir: string) => {
      h.exports++
      h.maintenanceAtExport.push(h.maintenance.length)
      if (h.exports > 1) h.tamperAfter?.()
      const memories = [...h.memories.values()].map((m) => ({ id: m.id, channel: m.channel, status: m.status, pinned: null, key: m.key, textHash: createHash('sha256').update(m.text).digest('hex') }))
      if (h.exports === 1) h.afterBackup?.()
      const byStatus: Record<string, number> = {}
      for (const m of memories) byStatus[m.status] = (byStatus[m.status] ?? 0) + 1
      return { file: `${dir}/engramind-memorias.json`, source: 'https://engramind', exportedAt: null, totals: { memories: memories.length, byStatus, byChannel: {} }, memories }
    },
  }
})
vi.mock('@/features/engramind/server/channel-migration/model', async () => {
  const actual = await vi.importActual<typeof import('@/features/engramind/server/channel-migration/model')>('@/features/engramind/server/channel-migration/model')
  const clone = <T,>(value: T): T => structuredClone(value)
  const sorted = () => [...h.docs.values()].sort((a, b) => new Date(b.startedAt as Date).getTime() - new Date(a.startedAt as Date).getTime())
  const matches = (doc: Record<string, unknown>, filter: Record<string, unknown>) =>
    Object.entries(filter).every(([key, value]) => {
      if (value && typeof value === 'object' && '$in' in (value as object)) return ((value as { $in: unknown[] }).$in).includes(doc[key])
      return doc[key] === value
    })
  return {
    CHANNEL_MIGRATION_STEPS: actual.CHANNEL_MIGRATION_STEPS,
    ChannelMigration: {
      findById: (id: string) => ({ lean: async () => (h.docs.has(id) ? clone(h.docs.get(id)) : null) }),
      findOne: (filter: Record<string, unknown>) => ({ sort: () => ({ lean: async () => clone(sorted().find((doc) => matches(doc, filter)) ?? null) }) }),
      exists: async (filter: Record<string, unknown>) => (sorted().some((doc) => matches(doc, filter)) ? { _id: 'x' } : null),
      create: async (doc: Record<string, unknown>) => {
        h.docs.set(doc._id as string, { ...clone(doc), startedAt: new Date(Date.now() + h.seq++) })
      },
      updateOne: async (filter: { _id: string }, update: { $set?: Record<string, unknown>; $push?: { log: { $each: unknown[] } } }) => {
        const doc = h.docs.get(filter._id)
        if (!doc) return
        Object.assign(doc, clone(update.$set ?? {}))
        if (update.$push) doc.log = [...((doc.log as unknown[]) ?? []), ...update.$push.log.$each]
      },
    },
  }
})
vi.mock('@/features/engramind/server/client', async () => {
  const { toEngramindError } = await import('@/features/engramind/server/errors')
  const decode = (value: string) => decodeURIComponent(value)
  const fail = (status: number, code: string, details?: unknown) => toEngramindError(status, { code, message: code, details } as never)
  return {
    engramindTarget: async () => ({ baseUrl: 'http://engramind', token: 'admin' }),
    engramindCall: async (method: string, request: { path: string; query?: Record<string, unknown>; body?: Record<string, unknown> }, options: { idempotencyKey?: string } = {}) => {
      const { path, query = {}, body = {} } = request
      h.calls.push({ method, path, key: options.idempotencyKey, body })
      let match: RegExpMatchArray | null
      if (method === 'GET' && path === '/v1/channels') return { channels: [...h.channels.values()].filter((c) => query.include_archived || !c.archived_at), next_cursor: null }
      if (method === 'POST' && path === '/v1/channels') {
        const slug = body.slug as string
        if (h.channels.has(slug)) throw fail(409, 'SLUG_ALREADY_EXISTS')
        h.channels.set(slug, { slug, name: body.name as string, description: (body.description as string) ?? null, priority: (body.priority as number) ?? 0, archived_at: null })
        return h.channels.get(slug)
      }
      if ((match = path.match(/^\/v1\/channels\/(.+)\/settings$/))) {
        const slug = decode(match[1]!)
        if (method === 'GET') return { channel: slug, channel_id: slug, settings: Object.entries(h.settings.get(slug) ?? {}).map(([key, override]) => ({ key, override })) }
        h.settings.set(slug, { ...(h.settings.get(slug) ?? {}), ...body })
        return {}
      }
      if ((match = path.match(/^\/v1\/channels\/(.+)\/(archive|restore)$/))) {
        const channel = h.channels.get(decode(match[1]!))
        if (!channel) throw fail(404, 'CHANNEL_NOT_FOUND')
        channel.archived_at = match[2] === 'archive' ? '2026-11-27T00:00:00Z' : null
        return channel
      }
      if (method === 'GET' && (match = path.match(/^\/v1\/channels\/(.+)$/))) {
        const channel = h.channels.get(decode(match[1]!))
        if (!channel) throw fail(404, 'CHANNEL_NOT_FOUND')
        return channel
      }
      if (method === 'GET' && path === '/v1/memories') return { memories: [...h.memories.values()].filter((m) => m.channel === query.channels).map((m) => ({ id: m.id, channel: m.channel, status: m.status })), next_cursor: null }
      if (method === 'POST' && (match = path.match(/^\/v1\/memories\/(.+)\/move$/))) {
        const memory = h.memories.get(decode(match[1]!))!
        if (h.failMove?.(memory.id)) throw new Error('queda no meio')
        const to = body.to as string
        if (h.channels.get(memory.channel)?.archived_at || h.channels.get(to)?.archived_at) throw fail(409, 'CHANNEL_ARCHIVED')
        const duplicate = [...h.memories.values()].find((m) => m.channel === to && m.text === memory.text && m.id !== memory.id)
        if (duplicate) throw fail(409, 'MEMORY_DUPLICATE', { existing_id: duplicate.id })
        memory.channel = to
        h.moves.set(memory.id, (h.moves.get(memory.id) ?? 0) + 1)
        return memory
      }
      if (method === 'GET' && path === '/v1/subscriptions') {
        const channel = query.channel as string
        return { subscriptions: h.subscriptions.filter((s) => (s.target.endsWith('*') ? channel.startsWith(s.target.slice(0, -1)) : s.target === channel)), next_cursor: null }
      }
      if (method === 'POST' && path === '/v1/subscriptions') {
        const agent = body.agent as string
        const created = { id: `sub_${h.seq++}`, agent: { id: agent, slug: agent.split('/')[1]!, qualified_slug: agent }, target: body.target as string, mode: body.mode as string, access: (body.access as string[]) ?? null, priority: (body.priority as number) ?? null }
        h.subscriptions.push(created)
        return { ...created, created: true }
      }
      if (method === 'DELETE' && (match = path.match(/^\/v1\/subscriptions\/(.+)$/))) {
        const id = decode(match[1]!)
        if (!h.subscriptions.some((s) => s.id === id)) throw fail(404, 'SUBSCRIPTION_NOT_FOUND')
        h.subscriptions = h.subscriptions.filter((s) => s.id !== id)
        return {}
      }
      throw new Error(`inesperado ${method} ${path}`)
    },
  }
})

import { channelMigrationIdle, getChannelMigrationState, setChannelMigrationRateLimitWait, startChannelMigration } from '@/features/engramind/server/channel-migration/runner'

const ch = (slug: string, archived = false): FakeChannel => ({ slug, name: `Canal ${slug}`, description: `desc ${slug}`, priority: 7, archived_at: archived ? '2026-10-01T00:00:00Z' : null })
const mem = (id: string, channel: string, text: string, status = 'active'): FakeMemory => ({ id, channel, status, text, key: null })

function seed() {
  for (const channel of [ch('opex'), ch('agentes/adversario'), ch('agentes/desenvolvedor/central/c1', true), ch('vagas/x')]) h.channels.set(channel.slug, channel)
  for (const memory of [mem('m_1', 'agentes/adversario', 'regra 1'), mem('m_2', 'agentes/adversario', 'regra 2', 'archived'), mem('m_3', 'agentes/desenvolvedor/central/c1', 'central', 'permanent'), mem('m_4', 'vagas/x', 'vaga'), mem('m_5', 'opex', 'global')]) h.memories.set(memory.id, memory)
  h.settings.set('agentes/adversario', { 'memory.text_max': 2000, 'context.budget': null })
  h.subscriptions = [
    { id: 'sub_a', agent: { id: 'ag_m', slug: 'mentor', qualified_slug: 'opex/mentor' }, target: 'agentes/adversario', mode: 'inject', access: ['read', 'write'], priority: 3 },
    { id: 'sub_b', agent: { id: 'ag_d', slug: 'dev', qualified_slug: 'dndicas/dev' }, target: 'agentes/desenvolvedor/*', mode: 'search', access: null, priority: null },
    { id: 'sub_c', agent: { id: 'ag_o', slug: 'opex', qualified_slug: 'opex/opex' }, target: 'opex', mode: 'inject', access: null, priority: null },
  ]
}

const destructive = () => h.calls.filter((call) => call.method === 'DELETE' && !call.path.startsWith('/v1/subscriptions/'))
const latest = () => [...h.docs.values()].sort((a, b) => new Date(b.startedAt as Date).getTime() - new Date(a.startedAt as Date).getTime())[0]!

beforeEach(() => {
  h.channels.clear()
  h.memories.clear()
  h.settings.clear()
  h.subscriptions = []
  h.calls = []
  h.moves.clear()
  h.failMove = null
  h.tamperAfter = null
  h.afterBackup = null
  h.maintenanceAtExport = []
  h.docs.clear()
  h.prefixed = false
  h.maintenance = []
  h.naming = []
  h.scriptPath = '/home/burgos/linux-scripts/export-engramind-memories.mjs'
  h.exports = 0
  setChannelMigrationRateLimitWait(1)
  seed()
})

describe('migração B: ida', () => {
  it('move todas as memórias, recria as assinaturas, confere e só então arquiva (sem excluir nada)', async () => {
    await startChannelMigration({ direction: 'forward' }, 'local')
    await channelMigrationIdle()
    expect(latest().status).toBe('done')
    expect(h.memories.get('m_1')!.channel).toBe('opex/agentes/adversario')
    expect(h.memories.get('m_2')).toMatchObject({ channel: 'opex/agentes/adversario', status: 'archived', text: 'regra 2' })
    expect(h.memories.get('m_3')).toMatchObject({ channel: 'opex/agentes/desenvolvedor/central/c1', status: 'permanent' })
    expect(h.memories.get('m_4')!.channel).toBe('vagas/x')
    expect(h.memories.get('m_5')!.channel).toBe('opex')
    // Destino com nome, descrição, prioridade e configurações da origem.
    expect(h.channels.get('opex/agentes/adversario')).toMatchObject({ name: 'Canal agentes/adversario', description: 'desc agentes/adversario', priority: 7 })
    expect(h.settings.get('opex/agentes/adversario')).toEqual({ 'memory.text_max': 2000 })
    // Origens arquivadas; o destino de uma origem que já era arquivada também.
    expect(h.channels.get('agentes/adversario')!.archived_at).not.toBeNull()
    expect(h.channels.get('agentes/desenvolvedor/central/c1')!.archived_at).not.toBeNull()
    expect(h.channels.get('opex/agentes/desenvolvedor/central/c1')!.archived_at).not.toBeNull()
    expect(h.channels.get('opex/agentes/adversario')!.archived_at).toBeNull()
    // Assinaturas: mesmo modo, acesso e prioridade (inclusive de outro app); as antigas removidas; a raiz intocada.
    expect(h.subscriptions.map((s) => `${s.agent.qualified_slug}|${s.target}|${s.mode}|${JSON.stringify(s.access)}|${s.priority}`).sort()).toEqual(
      ['dndicas/dev|opex/agentes/desenvolvedor/*|search|null|null', 'opex/mentor|opex/agentes/adversario|inject|["read","write"]|3', 'opex/opex|opex|inject|null|null'].sort(),
    )
    expect(destructive()).toEqual([])
    expect(h.naming).toEqual(['prefixed'])
    expect(h.maintenance[0]).toBe(latest()._id)
    expect(h.maintenance.at(-1)).toBeNull()
    const moveKeys = h.calls.filter((call) => call.path.endsWith('/move')).map((call) => call.key)
    expect(moveKeys.every((key) => key?.startsWith(`opex-chmig-${latest()._id}-`))).toBe(true)
    const state = await getChannelMigrationState()
    expect(state.current?.subscriptions.find((s) => s.agent === 'dndicas/dev')?.foreign).toBe(true)
  })

  it('duplicata no destino fica na origem (sem sobrescrever) e a origem não é arquivada', async () => {
    h.channels.set('opex/agentes/adversario', ch('opex/agentes/adversario'))
    h.memories.set('m_9', mem('m_9', 'opex/agentes/adversario', 'regra 1'))
    await startChannelMigration({ direction: 'forward' }, 'local')
    await channelMigrationIdle()
    const doc = latest()
    expect(doc.status).toBe('done_with_conflicts')
    expect(doc.conflicts).toEqual([{ id: 'm_1', channel: 'agentes/adversario', code: 'MEMORY_DUPLICATE', existingId: 'm_9' }])
    expect(h.memories.get('m_1')!.channel).toBe('agentes/adversario')
    expect(h.memories.get('m_9')!.text).toBe('regra 1')
    expect(h.channels.get('agentes/adversario')!.archived_at).toBeNull()
  })

  it('não arquiva quando a conferência não bate e mantém a manutenção', async () => {
    h.tamperAfter = () => {
      h.memories.get('m_1')!.text = 'texto alterado'
    }
    await startChannelMigration({ direction: 'forward' }, 'local')
    await channelMigrationIdle()
    const doc = latest()
    expect(doc.status).toBe('verify_failed')
    expect((doc.verify as { problems: string[] }).problems.join('\n')).toMatch(/Texto alterado: m_1/)
    expect(h.calls.some((call) => call.path.endsWith('/archive'))).toBe(false)
    expect(h.maintenance.at(-1)).toBe(doc._id)
  })

  it('retomada idempotente: continua de onde parou sem mover de novo', async () => {
    h.failMove = (id) => id === 'm_2'
    await startChannelMigration({ direction: 'forward' }, 'local')
    await channelMigrationIdle()
    expect(latest().status).toBe('failed')
    expect(h.memories.get('m_1')!.channel).toBe('opex/agentes/adversario')
    h.failMove = null
    await startChannelMigration({ direction: 'forward' }, 'local')
    await channelMigrationIdle()
    expect(h.docs.size).toBe(1)
    expect(latest().status).toBe('done')
    expect(h.moves.get('m_1')).toBe(1)
    expect(h.moves.get('m_2')).toBe(1)
    expect(h.exports).toBe(2)
  })

  it('a manutenção liga antes do backup', async () => {
    await startChannelMigration({ direction: 'forward' }, 'local')
    await channelMigrationIdle()
    expect(h.maintenanceAtExport[0]).toBeGreaterThan(0)
  })

  it('backup que não confere: a retomada refaz o backup e mantém o arquivado de antes do restore', async () => {
    // Memória gravada entre o backup e o mapa: o backup não confere com o Engramind.
    h.afterBackup = () => h.memories.set('m_6', mem('m_6', 'agentes/adversario', 'regra 6'))
    await startChannelMigration({ direction: 'forward' }, 'local')
    await channelMigrationIdle()
    expect(latest()).toMatchObject({ status: 'failed', step: 'backup', backup: null })
    expect(latest().error).toMatch(/backup não confere/)
    // O mapa gravado guarda que a central estava arquivada, mesmo com a origem já restaurada.
    expect(h.channels.get('agentes/desenvolvedor/central/c1')!.archived_at).toBeNull()
    expect((latest().map as { from: string; wasArchived: boolean }[]).find((item) => item.from === 'agentes/desenvolvedor/central/c1')?.wasArchived).toBe(true)
    expect(h.calls.some((call) => call.path.endsWith('/move'))).toBe(false)
    await startChannelMigration({ direction: 'forward' }, 'local')
    await channelMigrationIdle()
    expect(h.docs.size).toBe(1)
    expect(latest().status).toBe('done')
    expect(h.exports).toBe(3)
    expect(h.memories.get('m_6')!.channel).toBe('opex/agentes/adversario')
    // A origem que já era arquivada e o destino dela terminam arquivados.
    expect(h.channels.get('agentes/desenvolvedor/central/c1')!.archived_at).not.toBeNull()
    expect(h.channels.get('opex/agentes/desenvolvedor/central/c1')!.archived_at).not.toBeNull()
  })

  it('não começa sem o script de backup', async () => {
    h.scriptPath = null
    await expect(startChannelMigration({ direction: 'forward' }, 'local')).rejects.toMatchObject({ code: 'CHANNEL_MIGRATION_SCRIPT_REQUIRED' })
    expect(h.docs.size).toBe(0)
    expect(h.calls).toEqual([])
  })
})

describe('migração B: volta atrás', () => {
  it('move de volta, restaura as assinaturas antigas e volta aos nomes antigos', async () => {
    await startChannelMigration({ direction: 'forward' }, 'local')
    await channelMigrationIdle()
    await startChannelMigration({ direction: 'revert' }, 'local')
    await channelMigrationIdle()
    expect(latest()).toMatchObject({ direction: 'revert', status: 'done' })
    expect(h.memories.get('m_1')!.channel).toBe('agentes/adversario')
    expect(h.memories.get('m_3')).toMatchObject({ channel: 'agentes/desenvolvedor/central/c1', status: 'permanent' })
    expect(h.subscriptions.map((s) => `${s.agent.qualified_slug}|${s.target}|${s.mode}|${s.priority}`).sort()).toEqual(['dndicas/dev|agentes/desenvolvedor/*|search|null', 'opex/mentor|agentes/adversario|inject|3', 'opex/opex|opex|inject|null'].sort())
    expect(h.naming).toEqual(['prefixed', 'legacy'])
    expect(h.channels.get('agentes/adversario')!.archived_at).toBeNull()
    expect(h.channels.get('agentes/desenvolvedor/central/c1')!.archived_at).not.toBeNull()
    expect(h.channels.get('opex/agentes/adversario')!.archived_at).not.toBeNull()
    expect(destructive()).toEqual([])
  })

  it('canais gerenciados criados depois da ida também voltam para os nomes antigos', async () => {
    await startChannelMigration({ direction: 'forward' }, 'local')
    await channelMigrationIdle()
    h.channels.set('opex/agentes/rotineiros/novo', ch('opex/agentes/rotineiros/novo'))
    h.memories.set('m_7', mem('m_7', 'opex/agentes/rotineiros/novo', 'do rotineiro novo'))
    await startChannelMigration({ direction: 'revert' }, 'local')
    await channelMigrationIdle()
    expect(latest()).toMatchObject({ direction: 'revert', status: 'done' })
    expect(h.memories.get('m_7')!.channel).toBe('agentes/rotineiros/novo')
    expect(h.channels.get('agentes/rotineiros/novo')!.archived_at).toBeNull()
    expect(h.channels.get('opex/agentes/rotineiros/novo')!.archived_at).not.toBeNull()
  })
})
