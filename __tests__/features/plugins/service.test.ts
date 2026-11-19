import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeCollection, type FakeCollection } from '../../helpers/fake-collection'

/**
 * Serviço dos plugins (OPE-172): versão draft só com manifesto e compilação válidos, prévia, consolidação
 * transacional (falha de ativação mantém a estável), rollback, ativar/desativar, acesso do portal só
 * aos plugins do próprio cliente, auditoria e o evento `plugin-updated` nos canais do escopo.
 */

const holder = vi.hoisted(() => ({
  plugins: null as unknown as FakeCollection,
  versions: null as unknown as FakeCollection,
  audit: [] as Array<Record<string, unknown>>,
  appEvents: [] as unknown[],
  clientEvents: [] as unknown[],
  activate: vi.fn(),
  deactivate: vi.fn(async () => undefined),
  compile: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined, recordAudit: async (input: Record<string, unknown>) => void holder.audit.push(input) }))
vi.mock('@/lib/pusher/channels', () => ({
  publishAppEvent: async (event: string, payload: unknown) => void holder.appEvents.push({ event, payload }),
  publishClientEvent: async (clientId: string, event: string, payload: unknown) => void holder.clientEvents.push({ clientId, event, payload }),
}))
vi.mock('@/lib/logger', () => ({ loggerFor: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))
vi.mock('@/lib/db/models/Orcamento', () => ({ OrcamentoClient: { find: () => ({ lean: async () => [{ _id: 'cli1', name: 'ACME' }] }) } }))
vi.mock('@/lib/db/models/Plugin', () => ({
  get Plugin() {
    return { ...holder.plugins, exists: async (filter: Record<string, unknown>) => ((await holder.plugins.findOne(filter)) ? { _id: 'x' } : null) }
  },
  get PluginVersion() {
    return holder.versions
  },
}))
vi.mock('@/features/plugins/server/kernel/kernel', () => ({ activatePluginServer: holder.activate, deactivatePluginServer: holder.deactivate }))
vi.mock('@/features/plugins/server/compiler/rolldown', () => ({ compilePluginSources: holder.compile }))

import { consolidateVersion, createDraftVersion, createPluginRecord, getPlugin, listPlugins, publishPreviewVersion, rollbackPlugin, setPluginActive } from '@/features/plugins/server/service'

const files = (id = 'relogio', scope = 'owner') => [
  { path: 'plugin.json', content: JSON.stringify({ id, name: 'Relógio', apiVersion: '1.0', scope, entries: { client: 'client/index.tsx' }, slots: [{ slot: scope === 'owner' ? 'dashboard.widgets' : 'portal.dashboard.widgets', export: 'Widget' }] }) },
  { path: 'client/index.tsx', content: 'export default {}' },
  { path: 'client/index.test.tsx', content: '' },
]
const source = { taskId: 't1', taskCode: 'OPE-172', workbenchId: 'wb1' }

beforeEach(() => {
  holder.plugins = createFakeCollection(() => ({ active: true, stableVersionId: null, previewVersionId: null, previewWorkbenchId: null, runtimeError: null, clientId: null, description: '' }))
  holder.versions = createFakeCollection(() => ({ promotedAt: null, baseVersionId: null }))
  holder.audit = []
  holder.appEvents = []
  holder.clientEvents = []
  holder.activate.mockReset().mockResolvedValue({ ok: true })
  holder.deactivate.mockClear()
  holder.compile.mockReset().mockResolvedValue({ ok: true, server: { code: 's', hash: 'a'.repeat(16), css: null, cssHash: null }, client: { code: 'c', hash: 'b'.repeat(16), css: null, cssHash: null }, log: 'ok' })
})

/** Versão nova a partir da estável atual (`base` força outra base). */
async function draft(id = 'relogio', base?: string | null, workbenchSource = source) {
  const baseVersionId = base !== undefined ? base : ((holder.plugins.docs.find((doc) => doc.pluginId === id)?.stableVersionId as string | null) ?? null)
  const result = await createDraftVersion({ pluginId: id, files: files(id), baseVersionId, source: workbenchSource, author: 'local' })
  if (!result.ok) throw new Error(result.issues.join('; '))
  return result
}

describe('versões', () => {
  it('rascunho → prévia → estável, com auditoria e evento plugin-updated', async () => {
    await createPluginRecord({ pluginId: 'relogio', name: 'Relógio', scope: 'owner', clientId: null, actorId: 'local' })
    const v1 = await draft()
    expect(v1.number).toBe(1)
    expect(holder.versions.docs[0]).toMatchObject({ state: 'draft', tests: ['client/index.test.tsx'], source })

    await publishPreviewVersion('relogio', v1.versionId, { workbenchId: 'wb1', actorId: 'local' })
    expect(holder.plugins.docs[0]).toMatchObject({ previewVersionId: v1.versionId, previewWorkbenchId: 'wb1' })
    expect(holder.activate).toHaveBeenLastCalledWith(expect.objectContaining({ channel: 'preview', versionId: v1.versionId }))

    await consolidateVersion('relogio', v1.versionId, 'local')
    expect(holder.plugins.docs[0]).toMatchObject({ stableVersionId: v1.versionId, previewVersionId: null })
    expect(holder.versions.docs[0]).toMatchObject({ state: 'stable', promotedAt: expect.any(Date) })
    expect(holder.audit.map((entry) => entry.acao)).toEqual(['CRIAR', 'CRIAR', 'ATUALIZAR', 'APROVAR'])
    expect(holder.appEvents.at(-1)).toEqual({ event: 'plugin-updated', payload: { id: 'relogio', version: 1, channel: 'stable' } })
  })

  it('manifesto inválido ou compilação com erro não grava versão', async () => {
    await createPluginRecord({ pluginId: 'relogio', name: 'Relógio', scope: 'owner', clientId: null, actorId: 'local' })
    expect(await createDraftVersion({ pluginId: 'relogio', files: files('outro-id'), baseVersionId: null, source, author: 'local' })).toEqual({ ok: false, issues: ['O id do manifesto (outro-id) difere do plugin (relogio)'] })
    holder.compile.mockResolvedValueOnce({ ok: false, errors: ['Erro de compilação: x'], log: '' })
    expect(await createDraftVersion({ pluginId: 'relogio', files: files(), baseVersionId: null, source, author: 'local' })).toEqual({ ok: false, issues: ['Erro de compilação: x'] })
    expect(holder.versions.docs).toHaveLength(0)
  })

  it('consolidação que não ativa no servidor mantém a estável anterior e grava o erro de runtime', async () => {
    await createPluginRecord({ pluginId: 'relogio', name: 'Relógio', scope: 'owner', clientId: null, actorId: 'local' })
    const v1 = await draft()
    await publishPreviewVersion('relogio', v1.versionId, { workbenchId: 'wb1', actorId: 'local' })
    await consolidateVersion('relogio', v1.versionId, 'local')
    const v2 = await draft()
    await publishPreviewVersion('relogio', v2.versionId, { workbenchId: 'wb2', actorId: 'local' })
    holder.activate.mockResolvedValueOnce({ ok: false, error: 'Falha ao ativar a versão do plugin: quebrou' })
    await expect(consolidateVersion('relogio', v2.versionId, 'local')).rejects.toThrow('A versão estável anterior continua ativa')
    expect(holder.plugins.docs[0]).toMatchObject({ stableVersionId: v1.versionId, runtimeError: { channel: 'stable', versionId: v2.versionId } })
  })

  it('rollback volta para uma versão consolidada antes e arquiva a atual; rascunho não serve', async () => {
    await createPluginRecord({ pluginId: 'relogio', name: 'Relógio', scope: 'owner', clientId: null, actorId: 'local' })
    const v1 = await draft()
    await publishPreviewVersion('relogio', v1.versionId, { workbenchId: 'wb1', actorId: 'local' })
    await consolidateVersion('relogio', v1.versionId, 'local')
    const v2 = await draft()
    await publishPreviewVersion('relogio', v2.versionId, { workbenchId: 'wb2', actorId: 'local' })
    await consolidateVersion('relogio', v2.versionId, 'local')
    const v3 = await draft()

    await expect(rollbackPlugin('relogio', v3.versionId, 'local')).rejects.toThrow('O rollback só volta para uma versão já consolidada antes')
    await expect(rollbackPlugin('relogio', v2.versionId, 'local')).rejects.toThrow()
    expect(await rollbackPlugin('relogio', v1.versionId, 'local')).toEqual({ number: 1 })
    expect(holder.plugins.docs[0]!.stableVersionId).toBe(v1.versionId)
    expect(holder.versions.docs.map((doc) => doc.state)).toEqual(['stable', 'archived', 'draft'])
  })
})

describe('concorrência entre mesas do mesmo plugin', () => {
  it('versão que partiu de uma estável antiga não vira prévia nem é consolidada (as mudanças da outra mesa ficam)', async () => {
    await createPluginRecord({ pluginId: 'relogio', name: 'Relógio', scope: 'owner', clientId: null, actorId: 'local' })
    const v1 = await draft()
    await publishPreviewVersion('relogio', v1.versionId, { workbenchId: 'wb0', actorId: 'local' })
    await consolidateVersion('relogio', v1.versionId, 'local')
    // As mesas A e B partem da v1; A consolida a v2.
    const a = await draft('relogio', v1.versionId, { ...source, workbenchId: 'wbA', taskCode: 'OPE-1' })
    const b = await draft('relogio', v1.versionId, { ...source, workbenchId: 'wbB', taskCode: 'OPE-2' })
    await publishPreviewVersion('relogio', a.versionId, { workbenchId: 'wbA', actorId: 'local' })
    await consolidateVersion('relogio', a.versionId, 'local')

    await expect(publishPreviewVersion('relogio', b.versionId, { workbenchId: 'wbB', actorId: 'local' })).rejects.toMatchObject({ status: 409, code: 'PLUGIN_BASE_OUTDATED', message: 'A versão v3 partiu da estável v1, mas a estável agora é v2. Refaça a alteração a partir da estável atual' })
    expect(holder.plugins.docs[0]).toMatchObject({ stableVersionId: a.versionId, previewVersionId: null })
  })

  it('a prévia de uma mesa não é trocada por outra; a consolidação também confere a base', async () => {
    await createPluginRecord({ pluginId: 'relogio', name: 'Relógio', scope: 'owner', clientId: null, actorId: 'local' })
    const a = await draft('relogio', null, { ...source, workbenchId: 'wbA', taskCode: 'OPE-1' })
    const b = await draft('relogio', null, { ...source, workbenchId: 'wbB', taskCode: 'OPE-2' })
    await publishPreviewVersion('relogio', a.versionId, { workbenchId: 'wbA', actorId: 'local' })
    await expect(publishPreviewVersion('relogio', b.versionId, { workbenchId: 'wbB', actorId: 'local' })).rejects.toMatchObject({ code: 'PLUGIN_PREVIEW_BUSY', message: 'O plugin já tem uma prévia da tarefa OPE-1 (v1). Aguarde ela ser consolidada ou descartada' })
    expect(holder.versions.docs.find((doc) => String(doc._id) === a.versionId)?.state).toBe('preview')
    // A própria mesa pode republicar a prévia (correção depois dos testes).
    const a2 = await draft('relogio', null, { ...source, workbenchId: 'wbA', taskCode: 'OPE-1' })
    await publishPreviewVersion('relogio', a2.versionId, { workbenchId: 'wbA', actorId: 'local' })
    expect(holder.plugins.docs[0]!.previewVersionId).toBe(a2.versionId)

    // Uma estável que mudou por fora (ex.: rollback) também bloqueia a consolidação da prévia antiga.
    holder.plugins.docs[0]!.stableVersionId = b.versionId
    await expect(consolidateVersion('relogio', a2.versionId, 'local')).rejects.toMatchObject({ code: 'PLUGIN_BASE_OUTDATED' })
  })
})

describe('plugins de cliente e acesso do portal', () => {
  it('o portal só vê e altera plugins do próprio cliente; os eventos vão também ao canal do cliente', async () => {
    await createPluginRecord({ pluginId: 'painel', name: 'Painel', scope: 'client', clientId: 'cli1', actorId: 'local' })
    await createPluginRecord({ pluginId: 'interno', name: 'Interno', scope: 'owner', clientId: null, actorId: 'local' })
    expect((await listPlugins({ kind: 'client', clientId: 'cli1' })).map((plugin) => plugin.id)).toEqual(['painel'])
    expect((await listPlugins({ kind: 'client', clientId: 'cli1' }))[0]!.clientName).toBe('ACME')
    await expect(getPlugin('interno', { kind: 'client', clientId: 'cli1' })).rejects.toThrow('Plugin não encontrado')
    await expect(getPlugin('painel', { kind: 'client', clientId: 'cli2' })).rejects.toThrow('Plugin não encontrado')

    await setPluginActive('painel', false, 'user-1', { kind: 'client', clientId: 'cli1' })
    expect(holder.plugins.docs[0]!.active).toBe(false)
    // Plugin de cliente é só interface: nada a desfazer no kernel.
    expect(holder.deactivate).not.toHaveBeenCalled()
    expect(holder.clientEvents.at(-1)).toEqual({ clientId: 'cli1', event: 'plugin-updated', payload: { id: 'painel', version: null, channel: null } })
  })

  it('plugin de cliente exige o cliente', async () => {
    await expect(createPluginRecord({ pluginId: 'painel', name: 'Painel', scope: 'client', clientId: null, actorId: 'local' })).rejects.toThrow('Plugin de cliente exige o cliente')
  })

  it('desativar plugin do dono desfaz o código de servidor', async () => {
    await createPluginRecord({ pluginId: 'relogio', name: 'Relógio', scope: 'owner', clientId: null, actorId: 'local' })
    await setPluginActive('relogio', false, 'local')
    expect(holder.deactivate).toHaveBeenCalledWith('relogio')
  })
})
