import { describe, expect, it } from 'vitest'
import { compilePluginSources } from '@/features/plugins/server/compiler/rolldown'
import { compilePluginCss, extractClassCandidates } from '@/features/plugins/server/compiler/tailwind'
import { parsePluginManifest, type PluginSourceFile } from '@/features/plugins/manifest'

/**
 * Compilação das versões (OPE-172) com Rolldown e o Tailwind reais: módulos do shell externos e
 * reescritos para `opex-shared:`, dependência fora da lista recusada, CSS só das classes usadas.
 */

const manifest = { id: 'painel', name: 'Painel', apiVersion: '1.0', scope: 'client', entries: { client: 'client/index.tsx' }, slots: [{ slot: 'portal.dashboard.widgets', export: 'Widget' }] }

async function compile(client: string, extra: PluginSourceFile[] = []) {
  const files = [{ path: 'plugin.json', content: JSON.stringify(manifest) }, { path: 'client/index.tsx', content: client }, ...extra]
  const parsed = parsePluginManifest(files)
  if (!parsed.ok) throw new Error(parsed.issues.join('; '))
  return compilePluginSources(files, parsed.manifest)
}

describe('compilePluginSources (cliente)', () => {
  it('troca React e os componentes do Opex por marcadores e gera o CSS das classes usadas', async () => {
    const result = await compile(
      `import { useState } from "react"
import { Card } from "@opex/ui/card"
import { rotulo } from "./rotulo"
export function Widget() {
  const [n] = useState(1)
  return <Card className="bg-primary text-primary-foreground p-4">{rotulo(n)}</Card>
}
export default { slots: { Widget } }`,
      [{ path: 'client/rotulo.ts', content: 'export const rotulo = (n: number) => `Total ${n}`\n' }],
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.server).toBeNull()
    const code = result.client!.code
    expect(code).toContain('"opex-shared:react"')
    expect(code).toContain('"opex-shared:react/jsx-runtime"')
    expect(code).toContain('"opex-shared:@opex/ui/card"')
    expect(code).toContain('Total ')
    expect(result.client!.hash).toMatch(/^[0-9a-f]{16}$/)
    expect(result.client!.css).toContain('.bg-primary')
    expect(result.client!.css).toContain('.p-4')
  }, 60_000)

  it('recusa dependência npm fora da lista, módulo do Opex inexistente e arquivo ausente', async () => {
    const result = await compile(`import lodash from "lodash"
import { X } from "@opex/ui/nao-existe"
import { y } from "./faltando"
export default { slots: { W: () => lodash(X, y) } }`)
    expect(result.ok).toBe(false)
    if (result.ok) return
    const text = result.errors.join('\n')
    expect(text).toContain('Dependência não permitida no plugin: "lodash"')
    expect(text).toContain('Módulo do Opex inexistente: "@opex/ui/nao-existe"')
    expect(text).toContain('Arquivo não encontrado: ./faltando')
  }, 60_000)

  it('erro de sintaxe vira erro de compilação em pt-BR', async () => {
    const result = await compile('export const = 1')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]).toMatch(/^Erro de compilação:/)
  }, 60_000)
})

describe('compilePluginSources (servidor)', () => {
  it('só node:* e o SDK podem ser importados no servidor do dono', async () => {
    const files = [
      { path: 'plugin.json', content: JSON.stringify({ id: 'srv', name: 'Srv', apiVersion: '1.0', scope: 'owner', entries: { server: 'server/index.ts' } }) },
      { path: 'server/index.ts', content: 'import { definePlugin } from "@opex/plugin-sdk/server"\nimport { createHash } from "node:crypto"\nimport axios from "axios"\nexport default definePlugin({ apply() { createHash("sha1"); void axios } })' },
    ]
    const parsed = parsePluginManifest(files)
    if (!parsed.ok) throw new Error(parsed.issues.join('; '))
    const result = await compilePluginSources(files, parsed.manifest)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors).toEqual(['Import não permitido no servidor do plugin: "axios" (use node:* ou os serviços do ctx)'])
  }, 60_000)
})

describe('extractClassCandidates', () => {
  it('ignora os testes do plugin', () => {
    const candidates = extractClassCandidates([
      { path: 'a.tsx', content: '<div className="text-sm bg-card" />' },
      { path: 'a.test.tsx', content: '<div className="text-9xl" />' },
    ])
    expect(candidates).toEqual(expect.arrayContaining(['text-sm', 'bg-card']))
    expect(candidates).not.toContain('text-9xl')
  })
})

describe('compilePluginCss: uma compilação não vaza para a seguinte', () => {
  it('o CSS do segundo plugin não leva a classe do primeiro, e a mesma fonte dá o mesmo CSS', async () => {
    const a = [{ path: 'client/index.tsx', content: 'export const A = () => <p className="text-red-500">a</p>' }]
    const b = [{ path: 'client/index.tsx', content: 'export const B = () => <p className="underline">b</p>' }]
    const cssA = await compilePluginCss(a)
    const cssB = await compilePluginCss(b)
    expect(cssA).toContain('text-red-500')
    expect(cssB).toContain('underline')
    expect(cssB).not.toContain('text-red-500')
    expect(await compilePluginCss(b)).toBe(cssB)
  })
})
