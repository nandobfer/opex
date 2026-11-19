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
