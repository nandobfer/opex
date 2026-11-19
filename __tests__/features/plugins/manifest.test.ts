import { describe, expect, it } from 'vitest'
import { checkPluginApiVersion, manifestScopeIssue, normalizePluginFiles, parsePluginManifest } from '@/features/plugins/manifest'

/** Manifesto dos plugins (OPE-172): contrato restritivo, escopo do cliente só interface e versão do SDK. */

const manifest = (overrides: Record<string, unknown> = {}) => ({
  id: 'relogio',
  name: 'Relógio',
  apiVersion: '1.0',
  scope: 'owner',
  entries: { client: 'client/index.tsx', server: 'server/index.ts' },
  slots: [{ slot: 'dashboard.widgets', export: 'Widget' }],
  routes: [{ method: 'GET', path: '/hora' }],
  tools: ['hora'],
  ...overrides,
})
const files = (m: Record<string, unknown>, extra: Array<{ path: string; content: string }> = []) => [
  { path: 'plugin.json', content: JSON.stringify(m) },
  { path: 'client/index.tsx', content: 'export default {}' },
  { path: 'server/index.ts', content: 'export default {}' },
  ...extra,
]

describe('parsePluginManifest', () => {
  it('aceita um plugin do dono com servidor, slot, rota e ferramenta', () => {
    const result = parsePluginManifest(files(manifest()))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.manifest).toMatchObject({ id: 'relogio', crons: [], services: [], slots: [{ order: 100 }] })
  })

  it('recusa plugin de cliente com código de servidor (só interface)', () => {
    const result = parsePluginManifest(files(manifest({ scope: 'client', slots: [{ slot: 'portal.dashboard.widgets', export: 'Widget' }] })))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.join('\n')).toContain('Plugin de cliente é só interface; remova: entries.server, routes, tools, pasta server/')
  })

  it('recusa slot de outro escopo, página inexistente no menu e entrada ausente', () => {
    const result = parsePluginManifest([
      { path: 'plugin.json', content: JSON.stringify(manifest({ entries: { client: 'client/index.tsx' }, routes: [], tools: [], slots: [{ slot: 'portal.dashboard.widgets', export: 'W' }], nav: [{ label: 'Hora', page: 'hora' }] })) },
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const text = result.issues.join('\n')
      expect(text).toContain('O slot "portal.dashboard.widgets" não existe no escopo do dono')
      expect(text).toContain('aponta para a página inexistente "hora"')
      expect(text).toContain('Entrada do cliente não encontrada: client/index.tsx')
    }
  })

  it('sem plugin.json ou com JSON inválido devolve o problema em pt-BR', () => {
    expect(parsePluginManifest([])).toEqual({ ok: false, issues: ['Arquivo plugin.json não encontrado na raiz do plugin'] })
    expect(parsePluginManifest([{ path: 'plugin.json', content: '{' }])).toEqual({ ok: false, issues: ['plugin.json não é um JSON válido'] })
  })

  it('id e escopo do manifesto precisam bater com o plugin cadastrado', () => {
    const result = parsePluginManifest(files(manifest()))
    if (!result.ok) throw new Error('manifesto inválido')
    expect(manifestScopeIssue(result.manifest, { id: 'relogio', scope: 'owner' })).toBeNull()
    expect(manifestScopeIssue(result.manifest, { id: 'outro', scope: 'owner' })).toContain('difere do plugin')
    expect(manifestScopeIssue(result.manifest, { id: 'relogio', scope: 'client' })).toContain('O escopo do manifesto (owner)')
  })
})

describe('limites por arquivo das fontes (256 KB e caminho)', () => {
  it('recusa arquivo maior que 256 KB, citando o caminho', () => {
    const result = parsePluginManifest(files(manifest(), [{ path: 'client/dump.json', content: 'x'.repeat(256 * 1024 + 1) }]))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues).toContain('client/dump.json: Arquivo maior que o limite de 256 KB')
  })

  it('recusa caminho fora do padrão (subida de pasta ou caractere inválido)', () => {
    const result = parsePluginManifest(files(manifest(), [{ path: 'client/../segredo.ts', content: 'x' }, { path: 'client/meu arquivo.ts', content: 'x' }]))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toContain('client/../segredo.ts: Caminho de arquivo inválido')
      expect(result.issues).toContain('client/meu arquivo.ts: Caminho de arquivo inválido')
    }
  })

  it('arquivo no limite exato passa', () => {
    expect(parsePluginManifest(files(manifest(), [{ path: 'client/dados.ts', content: 'x'.repeat(256 * 1024) }])).ok).toBe(true)
  })
})

describe('checkPluginApiVersion', () => {
  it('major diferente recusa; minor maior só avisa', () => {
    expect(checkPluginApiVersion('1.0', '1.0')).toEqual({ ok: true, warning: null })
    expect(checkPluginApiVersion('1.3', '1.0')).toMatchObject({ ok: true, warning: expect.stringContaining('mais novo') })
    expect(checkPluginApiVersion('2.0', '1.0')).toEqual({ ok: false, message: 'Plugin incompatível com a versão do núcleo (plugin 2.0, núcleo 1.0)' })
  })
})

describe('normalizePluginFiles', () => {
  it('tira o ambiente local (SDK, node_modules, git, package.json) e ordena', () => {
    const result = normalizePluginFiles([
      { path: './plugin.json', content: '{}' },
      { path: 'node_modules/react/index.js', content: '' },
      { path: '.opex-sdk/GUIA.md', content: '' },
      { path: 'package.json', content: '{}' },
      { path: 'client/a.tsx', content: 'a' },
    ])
    expect(result.map((file) => file.path)).toEqual(['client/a.tsx', 'plugin.json'])
  })
})

describe('menu do portal (portal.nav, OPE-172)', () => {
  it('plugin de cliente pode declarar nav (menu do portal) e os slots novos; servidor continua proibido', () => {
    const client = manifest({ scope: 'client', entries: { client: 'client/index.tsx' }, routes: [], tools: [], slots: [{ slot: 'portal.task.panel', export: 'Aba' }], pages: [{ path: 'painel', title: 'Início', export: 'Home' }], nav: [{ label: 'Painel', page: 'painel' }] })
    const ok = parsePluginManifest(files(client).filter((file) => file.path !== 'server/index.ts'))
    expect(ok.ok).toBe(true)
    const withServer = parsePluginManifest(files({ ...client, entries: { client: 'client/index.tsx', server: 'server/index.ts' } }))
    expect(withServer.ok).toBe(false)
  })

  it('slot de menu declarado como slot é recusado', () => {
    const result = parsePluginManifest(files(manifest({ slots: [{ slot: 'sidebar.nav', export: 'X' }] })))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.join('\n')).toContain('Use a lista "nav" do manifesto para o menu (sidebar.nav)')
  })
})

describe('slots aninhados no manifesto (OPE-172, rodada 4)', () => {
  const ui = { entries: { client: 'client/index.tsx' }, routes: [], tools: [] }
  const page = { pages: [{ path: 'hora', title: 'Hora', export: 'Page' }] }

  it('item de menu dentro do menu Agentes é aceito; o slot novo de componente também', () => {
    const result = parsePluginManifest(files(manifest({ ...ui, ...page, slots: [{ slot: 'task.sidebar', export: 'Card' }], nav: [{ label: 'Hora', page: 'hora', slot: 'sidebar.nav.agentes' }] })))
    expect(result.ok).toBe(true)
  })

  it('área no lugar de slot é recusada com o caminho', () => {
    const result = parsePluginManifest(files(manifest({ ...ui, slots: [{ slot: 'area:dashboard', export: 'Card' }] })))
    expect(result).toEqual({ ok: false, issues: [expect.stringContaining('"area:dashboard" é uma área (Dashboards), não um slot')] })
  })

  it('slot de menu de outro escopo e menu usado como slot são recusados', () => {
    const client = parsePluginManifest(files(manifest({ ...ui, ...page, scope: 'client', slots: [], nav: [{ label: 'Hora', page: 'hora', slot: 'sidebar.nav.agentes' }] }), []).filter((file) => !file.path.startsWith('server/')))
    expect(client.ok).toBe(false)
    expect(!client.ok && client.issues.join('\n')).toContain('não é um menu do cliente')
    const asSlot = parsePluginManifest(files(manifest({ ...ui, slots: [{ slot: 'sidebar.nav.contabil', export: 'X' }] })))
    expect(!asSlot.ok && asSlot.issues.join('\n')).toContain('Use a lista "nav"')
    const notMenu = parsePluginManifest(files(manifest({ ...ui, ...page, slots: [], nav: [{ label: 'Hora', page: 'hora', slot: 'dashboard.widgets' }] })))
    expect(!notMenu.ok && notMenu.issues.join('\n')).toContain('não é um menu do dono')
  })
})
