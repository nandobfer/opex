import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Rotas dos plugins (OPE-172): a prévia só vale para o navegador que a ligou (cookie assinado), o
 * despacho de `/api/p/...` escolhe o canal por isso, a chave grava e limpa o cookie, a aprovação do
 * portal exige o admin do PRÓPRIO cliente e a rota de mensagens do Agente Opex leva a prévia ao turno.
 */

const mocks = vi.hoisted(() => ({
  actor: { userId: 'u1', client: { _id: 'cli1' }, isAdmin: true, preview: false },
  fibers: new Set<string>(),
  stableHandler: vi.fn(async () => ({ canal: 'stable' })),
  previewHandler: vi.fn(async () => ({ canal: 'preview' })),
  plugins: new Map<string, Record<string, unknown>>(),
  approve: vi.fn(async () => undefined),
  sendMessage: vi.fn(async () => ({ id: 'm1' })),
  setArchived: vi.fn(async (_id: string, archived: boolean) => ({ archived, changed: true })),
}))

vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined }))
vi.mock('@/lib/logger', () => ({ loggerFor: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }), logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/auth/server/context', async () => {
  const { DomainError } = await import('@/lib/api/route')
  return {
    requireAdminSession: vi.fn(async () => undefined),
    requireClientActor: vi.fn(async () => mocks.actor),
    // Mesma regra da real: só o admin do cliente.
    assertClientAdmin: (actor: { isAdmin: boolean }) => {
      if (!actor.isAdmin) throw new DomainError(403, 'Apenas administradores do cliente podem acessar.', 'FORBIDDEN')
    },
  }
})
vi.mock('@/features/plugins/server/kernel/kernel', () => ({ loadedPluginFiber: async (pluginId: string, channel: string) => (mocks.fibers.has(`${pluginId}|${channel}`) ? {} : null) }))
vi.mock('@/features/plugins/server/kernel/registries', () => ({
  findPluginRoute: (_pluginId: string, _method: string, path: string, channel: string) =>
    path === '/hora' ? { params: {}, entry: { handler: channel === 'preview' ? mocks.previewHandler : mocks.stableHandler } } : null,
}))
vi.mock('@/features/plugins/server/service', () => ({
  getPlugin: async (id: string) => ({ id }),
  findPlugin: async (id: string) => mocks.plugins.get(id) ?? null,
  setPluginArchived: mocks.setArchived,
}))
vi.mock('@/lib/db/models/Agentic', () => ({ AgenticWorkbench: {} }))
vi.mock('@/lib/db/models/Orcamento', () => ({ OrcamentoClient: {} }))
vi.mock('@/lib/db/models/Plugin', () => ({ Plugin: {}, PluginVersion: {} }))
vi.mock('@/features/agentic/server/workflow', () => ({ approve: mocks.approve }))
vi.mock('@/features/opex-agent/server/runner', () => ({ sendMessage: mocks.sendMessage }))
const logs = vi.hoisted(() => ({ record: vi.fn(), list: vi.fn(async () => [{ message: 'ok' }]) }))
vi.mock('@/features/plugins/server/logs', () => ({ recordPluginClientError: logs.record, listPluginLogs: logs.list }))

import { NextRequest } from 'next/server'
import { encodePreviewCookie } from '@/features/plugins/server/preview-cookie'
import { GET as pluginRoute } from '@/app/api/p/[pluginId]/[[...path]]/route'
import { POST as togglePreview } from '@/app/api/plugins/[id]/preview/route'
import { POST as approveFromPortal } from '@/app/api/cliente/plugins/[id]/approve/route'
import { POST as sendOpexMessage } from '@/app/api/opex/sessions/[id]/messages/route'
import { POST as approveFromOwner } from '@/app/api/plugins/[id]/approve/route'
import { GET as ownerLogs, POST as ownerClientError } from '@/app/api/plugins/[id]/logs/route'
import { POST as portalClientError } from '@/app/api/cliente/plugins/[id]/logs/route'
import { POST as archiveFromOwner } from '@/app/api/plugins/[id]/archive/route'
import { POST as archiveFromPortal } from '@/app/api/cliente/plugins/[id]/archive/route'

const COOKIE = 'opex_plugin_preview'
const request = (url: string, init: { method?: string; cookie?: string; body?: unknown } = {}) =>
  new NextRequest(`http://opex${url}`, {
    method: init.method ?? 'GET',
    headers: { ...(init.cookie ? { cookie: `${COOKIE}=${init.cookie}` } : {}), ...(init.body ? { 'content-type': 'application/json' } : {}) },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  })

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AUTH_SECRET = 'segredo-de-teste'
  mocks.fibers = new Set(['relogio|stable', 'relogio|preview'])
  mocks.actor = { userId: 'u1', client: { _id: 'cli1' }, isAdmin: true, preview: false }
  mocks.plugins = new Map([
    ['painel', { pluginId: 'painel', scope: 'client', clientId: 'cli1', previewVersionId: 'v2', previewWorkbenchId: 'wb1' }],
    ['alheio', { pluginId: 'alheio', scope: 'client', clientId: 'cli2', previewVersionId: 'v9', previewWorkbenchId: 'wb9' }],
  ])
})

describe('GET /api/p/[pluginId]/... (despacho por canal)', () => {
  const call = (cookie?: string) => pluginRoute(request('/api/p/relogio/hora', { cookie }), { params: Promise.resolve({ pluginId: 'relogio', path: ['hora'] }) })

  it('com a prévia do plugin ligada e a fiber de prévia viva, despacha na preview', async () => {
    const response = await call(encodePreviewCookie(['relogio'])!)
    expect((await response.json()).data).toEqual({ canal: 'preview' })
    expect(mocks.stableHandler).not.toHaveBeenCalled()
  })

  it('sem cookie, com cookie adulterado ou com a prévia de outro plugin, vai na stable', async () => {
    const forged = `${'relogio'}.${'x'.repeat(43)}`
    for (const cookie of [undefined, forged, encodePreviewCookie(['outro'])!]) {
      const response = await call(cookie)
      expect((await response.json()).data).toEqual({ canal: 'stable' })
    }
    expect(mocks.previewHandler).not.toHaveBeenCalled()
  })

  it('prévia ligada sem fiber de prévia (descartada) cai na stable', async () => {
    mocks.fibers.delete('relogio|preview')
    expect((await (await call(encodePreviewCookie(['relogio'])!)).json()).data).toEqual({ canal: 'stable' })
  })

  it('rota inexistente dá 404', async () => {
    const response = await pluginRoute(request('/api/p/relogio/nada'), { params: Promise.resolve({ pluginId: 'relogio', path: ['nada'] }) })
    expect(response.status).toBe(404)
  })
})

describe('POST /api/plugins/[id]/preview (cookie)', () => {
  const toggle = (on: boolean, cookie?: string) => togglePreview(request('/api/plugins/painel/preview', { method: 'POST', cookie, body: { on } }), { params: Promise.resolve({ id: 'painel' }) })

  it('ligar grava o cookie assinado com o plugin; desligar o último limpa o cookie', async () => {
    const on = await toggle(true)
    expect((await on.json()).data).toEqual({ previewOn: ['painel'] })
    const written = on.cookies.get(COOKIE)!
    expect(written.value).toBe(encodePreviewCookie(['painel']))
    expect(written.httpOnly).toBe(true)

    const off = await toggle(false, written.value)
    expect((await off.json()).data).toEqual({ previewOn: [] })
    expect(off.cookies.get(COOKIE)).toMatchObject({ value: '', maxAge: 0 })
  })

  it('ligar um segundo plugin mantém o primeiro na lista', async () => {
    const response = await toggle(true, encodePreviewCookie(['relogio'])!)
    expect((await response.json()).data.previewOn.sort()).toEqual(['painel', 'relogio'])
  })
})

describe('POST /api/cliente/plugins/[id]/approve (portal)', () => {
  const approve = (id: string) => approveFromPortal(request(`/api/cliente/plugins/${id}/approve`, { method: 'POST' }), { params: Promise.resolve({ id }) })

  it('o admin do próprio cliente aprova: a mesa dona da prévia segue com o approve', async () => {
    const response = await approve('painel')
    expect(response.status).toBe(200)
    expect(mocks.approve).toHaveBeenCalledWith('wb1', { approvedBy: 'u1' })
  })

  it('usuário que não é admin do cliente não aprova', async () => {
    mocks.actor = { ...mocks.actor, isAdmin: false }
    const response = await approve('painel')
    expect(response.status).toBe(403)
    expect(mocks.approve).not.toHaveBeenCalled()
  })

  it('plugin de outro cliente dá 404, sem aprovar', async () => {
    const response = await approve('alheio')
    expect(response.status).toBe(404)
    expect(mocks.approve).not.toHaveBeenCalled()
  })

  it('plugin arquivado não aprova a prévia (409)', async () => {
    mocks.plugins.set('painel', { ...mocks.plugins.get('painel')!, name: 'Painel', archivedAt: new Date() })
    const response = await approve('painel')
    expect(response.status).toBe(409)
    expect(mocks.approve).not.toHaveBeenCalled()
  })

  it('sem prévia aguardando aprovação dá 409', async () => {
    mocks.plugins.set('painel', { ...mocks.plugins.get('painel')!, previewVersionId: null, previewWorkbenchId: null })
    expect((await approve('painel')).status).toBe(409)
    expect(mocks.approve).not.toHaveBeenCalled()
  })
})

describe('POST .../plugins/[id]/archive (OPE-172, rodada 4)', () => {
  it('o dono arquiva com o ator local', async () => {
    const response = await archiveFromOwner(request('/api/plugins/relogio/archive', { method: 'POST', body: { archived: true } }), { params: Promise.resolve({ id: 'relogio' }) })
    expect(response.status).toBe(200)
    expect(mocks.setArchived).toHaveBeenCalledWith('relogio', true, 'local')
  })

  it('o admin do cliente arquiva no escopo do próprio cliente; não admin recebe 403; corpo inválido 400', async () => {
    const call = (body: unknown) => archiveFromPortal(request('/api/cliente/plugins/painel/archive', { method: 'POST', body }), { params: Promise.resolve({ id: 'painel' }) })
    expect((await call({ archived: false })).status).toBe(200)
    expect(mocks.setArchived).toHaveBeenCalledWith('painel', false, 'u1', { kind: 'client', clientId: 'cli1' })
    expect((await call({ archived: 'sim' })).status).toBe(400)
    mocks.actor = { ...mocks.actor, isAdmin: false }
    expect((await call({ archived: true })).status).toBe(403)
    expect(mocks.setArchived).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/opex/sessions/[id]/messages (prévia no turno)', () => {
  it('passa ao turno os plugins com a prévia ligada neste navegador', async () => {
    const response = await sendOpexMessage(request('/api/opex/sessions/s1/messages', { method: 'POST', cookie: encodePreviewCookie(['relogio'])!, body: { text: 'oi' } }), { params: Promise.resolve({ id: 's1' }) })
    expect(response.status).toBe(201)
    expect(mocks.sendMessage).toHaveBeenCalledWith('s1', expect.objectContaining({ text: 'oi' }), 'local', expect.objectContaining({ kind: 'owner', previewPlugins: ['relogio'] }))
  })

  it('cookie adulterado não liga prévia nenhuma', async () => {
    await sendOpexMessage(request('/api/opex/sessions/s1/messages', { method: 'POST', cookie: 'relogio.assinatura-falsa', body: { text: 'oi' } }), { params: Promise.resolve({ id: 's1' }) })
    expect(mocks.sendMessage).toHaveBeenCalledWith('s1', expect.anything(), 'local', expect.objectContaining({ previewPlugins: [] }))
  })
})

describe('rodada 3 (OPE-172): aprovar pelo dono e logs', () => {
  it('o dono aprova a prévia de qualquer plugin pela página dele', async () => {
    const response = await approveFromOwner(request('/api/plugins/alheio/approve', { method: 'POST' }), { params: Promise.resolve({ id: 'alheio' }) })
    expect(response.status).toBe(200)
    expect(mocks.approve).toHaveBeenCalledWith('wb9', { approvedBy: 'local' })
  })

  it('logs do dono: leitura com after e gravação do erro de interface', async () => {
    mocks.plugins.set('relogio', { pluginId: 'relogio', scope: 'owner', clientId: null })
    const read = await ownerLogs(request('/api/plugins/relogio/logs?after=2026-11-19T10:00:00.000Z&limit=10'), { params: Promise.resolve({ id: 'relogio' }) })
    expect((await read.json()).data).toEqual([{ message: 'ok' }])
    expect(logs.list).toHaveBeenCalledWith('relogio', { after: '2026-11-19T10:00:00.000Z', limit: 10 })
    const write = await ownerClientError(request('/api/plugins/relogio/logs', { method: 'POST', body: { message: 'boom', where: 'slot Widget', channel: 'preview' } }), { params: Promise.resolve({ id: 'relogio' }) })
    expect(write.status).toBe(200)
    expect(logs.record).toHaveBeenCalledWith('relogio', { message: 'boom', stack: null, channel: 'preview', where: 'slot Widget' })
  })

  it('portal: grava o erro só de plugin do próprio cliente (qualquer usuário do cliente)', async () => {
    mocks.actor = { ...mocks.actor, isAdmin: false }
    const own = await portalClientError(request('/api/cliente/plugins/painel/logs', { method: 'POST', body: { message: 'boom', where: 'slot Widget' } }), { params: Promise.resolve({ id: 'painel' }) })
    expect(own.status).toBe(200)
    const other = await portalClientError(request('/api/cliente/plugins/alheio/logs', { method: 'POST', body: { message: 'boom', where: 'slot Widget' } }), { params: Promise.resolve({ id: 'alheio' }) })
    expect(other.status).toBe(404)
    expect(logs.record).toHaveBeenCalledTimes(1)
  })
})
