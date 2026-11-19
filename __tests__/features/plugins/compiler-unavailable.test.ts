import { afterEach, describe, expect, it, vi } from 'vitest'
import { parsePluginManifest, type PluginSourceFile } from '@/features/plugins/manifest'

/**
 * Compilador indisponível no servidor (OPE-172, OPE-173): o Rolldown sem o binário nativo ou o
 * Tailwind sem as folhas de estilo é falha da instalação — rejeita com `PLUGIN_COMPILER_UNAVAILABLE`,
 * nunca vira "problema do plugin" (`ok: false`) para o agente corrigir. Erro de código continua sendo.
 */

const manifest = { id: 'painel', name: 'Painel', apiVersion: '1.0', scope: 'owner', entries: { client: 'client/index.tsx' }, slots: [{ slot: 'dashboard.widgets', export: 'Widget' }] }

function sources(client: string) {
  const files: PluginSourceFile[] = [{ path: 'plugin.json', content: JSON.stringify(manifest) }, { path: 'client/index.tsx', content: client }]
  const parsed = parsePluginManifest(files)
  if (!parsed.ok) throw new Error(parsed.issues.join('; '))
  return { files, manifest: parsed.manifest }
}

const WIDGET = 'export function Widget() { return <div className="bg-primary p-4">oi</div> }\nexport default { slots: { Widget } }'

afterEach(() => {
  vi.doUnmock('rolldown')
  vi.doUnmock('node:fs/promises')
  vi.resetModules()
})

describe('compilador de plugins indisponível', () => {
  it('Rolldown sem o binário nativo rejeita com PLUGIN_COMPILER_UNAVAILABLE', async () => {
    vi.resetModules()
    vi.doMock('rolldown', () => {
      throw new Error('Cannot find native binding. npm has a bug related to optional dependencies')
    })
    const { compilePluginSources } = await import('@/features/plugins/server/compiler/rolldown')
    const { files, manifest: parsed } = sources(WIDGET)
    await expect(compilePluginSources(files, parsed)).rejects.toMatchObject({
      status: 503,
      code: 'PLUGIN_COMPILER_UNAVAILABLE',
      // O Vitest embrulha o erro da fábrica do mock; no servidor real vem o "Cannot find native binding".
      message: expect.stringMatching(/^O compilador de plugins não está disponível neste servidor \(Rolldown: [\s\S]+\)\. Não é um problema do plugin: atualize a imagem do Opex e use Tentar novamente\.$/),
    })
  })

  it('Tailwind sem as folhas de estilo também (não entra nos problemas do plugin)', async () => {
    vi.resetModules()
    vi.doMock('node:fs/promises', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:fs/promises')>()
      return {
        ...actual,
        readFile: (async (file: Parameters<typeof actual.readFile>[0], options?: Parameters<typeof actual.readFile>[1]) => {
          if (String(file).endsWith('theme.css')) throw new Error(`ENOENT: no such file or directory, open '${String(file)}'`)
          return actual.readFile(file, options)
        }) as typeof actual.readFile,
      }
    })
    const { compilePluginSources } = await import('@/features/plugins/server/compiler/rolldown')
    const { files, manifest: parsed } = sources(WIDGET)
    await expect(compilePluginSources(files, parsed)).rejects.toMatchObject({ code: 'PLUGIN_COMPILER_UNAVAILABLE', message: expect.stringContaining('(Tailwind: ENOENT') })
  })

  it('erro de sintaxe do plugin continua sendo problema do plugin (ok: false)', async () => {
    vi.resetModules()
    const { compilePluginSources } = await import('@/features/plugins/server/compiler/rolldown')
    const { files, manifest: parsed } = sources('export function Widget() { return <div>\n')
    const result = await compilePluginSources(files, parsed)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]).toMatch(/^Erro de compilação:/)
  })
})
