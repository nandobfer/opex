import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeCollection, type FakeCollection } from '../../helpers/fake-collection'

/**
 * O que o navegador monta (OPE-172): a versão vigente por plugin (preview só com a prévia ligada neste
 * navegador), o endereço imutável do bundle e o acesso ao bundle (o portal só lê o próprio cliente).
 * Também o cookie assinado da prévia, que não aceita valor adulterado.
 */

const holder = vi.hoisted(() => ({ plugins: null as unknown as FakeCollection, versions: null as unknown as FakeCollection }))
vi.mock('@/lib/db', () => ({ dbConnect: async () => undefined }))
vi.mock('@/lib/db/models/Plugin', () => ({
  get Plugin() {
    return holder.plugins
  },
  get PluginVersion() {
    return holder.versions
  },
}))

import { buildRuntimeManifest, readBundle } from '@/features/plugins/server/runtime-manifest'
import { decodePreviewCookie, encodePreviewCookie } from '@/features/plugins/server/preview-cookie'

const manifest = (scope: string) => ({ slots: [{ slot: scope === 'owner' ? 'dashboard.widgets' : 'portal.dashboard.widgets', export: 'Widget', order: 100 }], pages: [{ path: '', title: 'Início', export: 'Home' }], nav: [{ label: 'Relógio', page: '', icon: 'Puzzle' }] })
const client = (hash: string) => ({ server: null, client: { code: `/*${hash}*/`, hash, css: '.a{}', cssHash: 'c'.repeat(16) } })

let stable = ''
let preview = ''
beforeEach(() => {
  process.env.AUTH_SECRET = 'segredo-de-teste'
  holder.plugins = createFakeCollection()
  holder.versions = createFakeCollection()
  stable = String(holder.versions.insert({ pluginId: 'relogio', number: 1, manifest: manifest('owner'), artifacts: client('1'.repeat(16)) })._id)
  preview = String(holder.versions.insert({ pluginId: 'relogio', number: 2, manifest: manifest('owner'), artifacts: client('2'.repeat(16)) })._id)
  holder.plugins.insert({ pluginId: 'relogio', name: 'Relógio', scope: 'owner', clientId: null, active: true, stableVersionId: stable, previewVersionId: preview })
  const portal = String(holder.versions.insert({ pluginId: 'painel', number: 1, manifest: manifest('client'), artifacts: client('3'.repeat(16)) })._id)
  holder.plugins.insert({ pluginId: 'painel', name: 'Painel', scope: 'client', clientId: 'cli1', active: true, stableVersionId: portal, previewVersionId: null })
})

describe('buildRuntimeManifest', () => {
  it('sem a prévia ligada, a stable; com ela, a preview do plugin, com o bundle imutável', async () => {
    const off = await buildRuntimeManifest({ kind: 'owner' }, [])
    expect(off.plugins).toEqual([expect.objectContaining({ id: 'relogio', versionNumber: 1, channel: 'stable', bundleUrl: `/plugins/bundles/${stable}/${'1'.repeat(16)}.js`, nav: [expect.objectContaining({ label: 'Relógio' })] })])
    const on = await buildRuntimeManifest({ kind: 'owner' }, ['relogio'])
    expect(on.plugins[0]).toMatchObject({ versionNumber: 2, channel: 'preview', revision: `2-${'2'.repeat(16)}` })
    expect(on.previewOn).toEqual(['relogio'])
  })

  it('o portal só recebe os plugins do próprio cliente, sem menu', async () => {
    const result = await buildRuntimeManifest({ kind: 'client', clientId: 'cli1' }, [])
    expect(result.plugins.map((plugin) => plugin.id)).toEqual(['painel'])
    expect(result.plugins[0]).toMatchObject({ nav: [], bundleUrl: expect.stringMatching(/^\/cliente\/plugins\/bundles\//) })
    expect((await buildRuntimeManifest({ kind: 'client', clientId: 'cli2' }, [])).plugins).toEqual([])
  })

  it('plugin desativado some', async () => {
    holder.plugins.docs[0]!.active = false
    expect((await buildRuntimeManifest({ kind: 'owner' }, ['relogio'])).plugins).toEqual([])
  })
})

describe('prévia ligada para plugin de cliente e pré-visualização do portal pelo dono', () => {
  it('a chave do dono reflete a prévia de um plugin de cliente (o dono gerencia os dois escopos)', async () => {
    const result = await buildRuntimeManifest({ kind: 'owner' }, ['painel'])
    expect(result.previewOn).toEqual(['painel'])
    // O plugin de cliente não monta no app do dono.
    expect(result.plugins.map((plugin) => plugin.id)).toEqual(['relogio'])
    // Id de plugin inexistente no cookie não aparece ligado.
    expect((await buildRuntimeManifest({ kind: 'owner' }, ['sumiu'])).previewOn).toEqual([])
  })

  it('o portal não vê como ligada a prévia de plugin de outro escopo', async () => {
    expect((await buildRuntimeManifest({ kind: 'client', clientId: 'cli1' }, ['relogio', 'painel'])).previewOn).toEqual(['painel'])
  })

  it('com a sessão do dono no portal, plugin de cliente só monta (e só serve o bundle) com a prévia ligada por ele', async () => {
    const off = await buildRuntimeManifest({ kind: 'client', clientId: 'cli1' }, [], { ownerPreview: true })
    expect(off.plugins).toEqual([])
    const portal = String(holder.plugins.docs[1]!.stableVersionId)
    await expect(readBundle({ kind: 'client', clientId: 'cli1' }, portal, `${'3'.repeat(16)}.js`, { previewOn: [], options: { ownerPreview: true } })).rejects.toThrow('Bundle não encontrado')

    const on = await buildRuntimeManifest({ kind: 'client', clientId: 'cli1' }, ['painel'], { ownerPreview: true })
    expect(on.plugins.map((plugin) => plugin.id)).toEqual(['painel'])
    expect((await readBundle({ kind: 'client', clientId: 'cli1' }, portal, `${'3'.repeat(16)}.js`, { previewOn: ['painel'], options: { ownerPreview: true } })).contentType).toBe('text/javascript; charset=utf-8')
  })

  it('o usuário do cliente continua vendo os plugins do próprio portal sem ligar nada', async () => {
    const portal = String(holder.plugins.docs[1]!.stableVersionId)
    expect((await buildRuntimeManifest({ kind: 'client', clientId: 'cli1' }, [], { ownerPreview: false })).plugins.map((plugin) => plugin.id)).toEqual(['painel'])
    expect((await readBundle({ kind: 'client', clientId: 'cli1' }, portal, `${'3'.repeat(16)}.js`)).contentType).toBe('text/javascript; charset=utf-8')
  })
})

describe('readBundle', () => {
  it('devolve o JS e o CSS pelo hash; hash errado ou plugin de outro escopo dá 404', async () => {
    expect(await readBundle({ kind: 'owner' }, stable, `${'1'.repeat(16)}.js`)).toEqual({ body: `/*${'1'.repeat(16)}*/`, contentType: 'text/javascript; charset=utf-8' })
    expect((await readBundle({ kind: 'owner' }, stable, `${'c'.repeat(16)}.css`)).contentType).toBe('text/css; charset=utf-8')
    await expect(readBundle({ kind: 'owner' }, stable, `${'9'.repeat(16)}.js`)).rejects.toThrow('Bundle não encontrado')
    await expect(readBundle({ kind: 'client', clientId: 'cli1' }, stable, `${'1'.repeat(16)}.js`)).rejects.toThrow('Bundle não encontrado')
    await expect(readBundle({ kind: 'owner' }, stable, '../etc.js')).rejects.toThrow('Bundle não encontrado')
  })
})

describe('cookie da prévia', () => {
  it('é assinado: valor adulterado vale como nenhum plugin em prévia', () => {
    const value = encodePreviewCookie(['relogio', 'painel'])!
    expect(decodePreviewCookie(value)).toEqual(['relogio', 'painel'])
    expect(decodePreviewCookie(value.replace('relogio', 'relogix'))).toEqual([])
    expect(decodePreviewCookie('qualquer')).toEqual([])
  })
})
