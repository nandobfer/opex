import { describe, expect, it, vi } from 'vitest'

vi.mock('@/features/plugins/client/shared-registry', () => ({ SHARED_MODULE_LOADERS: {}, apiModule: () => ({}) }))

import { linkSharedImports, sharedImportsOf, shimSource } from '@/features/plugins/client/loader'

/** Carregador do navegador (OPE-172): marcadores `opex-shared:` viram shims da instância única do shell. */
describe('loader', () => {
  const code = 'import { useState } from "opex-shared:react";\nimport { Card } from \'opex-shared:@opex/ui/card\';\nexport default {}'

  it('encontra os módulos compartilhados importados pelo bundle', () => {
    expect(sharedImportsOf(code)).toEqual(['react', '@opex/ui/card'])
  })

  it('troca cada marcador pela URL do shim e mantém o que não tem URL', () => {
    const linked = linkSharedImports(code, new Map([['react', 'blob:react']]))
    expect(linked).toContain('from "blob:react"')
    expect(linked).toContain("from 'opex-shared:@opex/ui/card'")
  })

  it('o shim reexporta as chaves da instância do shell e o padrão', () => {
    const source = shimSource('react', { useState: () => null, default: {}, 'nao-identificador': 1 })
    expect(source).toContain('globalThis.__OPEX_SHARED__["react"]')
    expect(source).toContain('export default (__opexSharedModule__.default ?? __opexSharedModule__);')
    expect(source).toContain('export const { useState } = __opexSharedModule__;')
    expect(source).not.toContain('nao-identificador')
  })
})

/**
 * Regressão (OPE-173: "Identifier 'm' has already been declared"): o shim de cada módulo REAL
 * compartilhado é importado pelo motor de verdade. O framer-motion exporta `m`, que colidia com a
 * variável local do shim; palavras reservadas também não podem virar nome de variável.
 */
describe('shims dos módulos reais', () => {
  const TABLE = '__OPEX_SHARED__'
  const real: Record<string, () => Promise<Record<string, unknown>>> = {
    react: () => import('react'),
    'react-dom': () => import('react-dom'),
    'framer-motion': () => import('framer-motion'),
    '@tanstack/react-query': () => import('@tanstack/react-query'),
    sonner: () => import('sonner'),
    'lucide-react': () => import('lucide-react'),
    'date-fns': () => import('date-fns'),
  }

  it.each(Object.keys(real))('%s: o shim importa e reexporta a mesma instância', async (id) => {
    const shared = { ...(await real[id]!()) }
    ;(globalThis as Record<string, unknown>)[TABLE] = { [id]: shared }
    const shim = (await import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(shimSource(id, shared))}`)) as Record<string, unknown>
    const sample = Object.keys(shared).find((name) => /^[A-Za-z_$][\w$]*$/.test(name) && name !== 'default')!
    expect(shim[sample]).toBe(shared[sample])
    if (id === 'framer-motion') {
      expect(shim.m).toBe(shared.m)
      expect(shim.motion).toBe(shared.motion)
    }
  }, 30_000)

  it('palavra reservada e o nome local não entram na reexportação', async () => {
    const shared = { default: { a: 1 }, class: 1, delete: 2, __opexSharedModule__: 3, ok: 4 }
    ;(globalThis as Record<string, unknown>)[TABLE] = { x: shared }
    const shim = (await import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(shimSource('x', shared))}`)) as Record<string, unknown>
    expect(shim.ok).toBe(4)
    expect(shim.default).toEqual({ a: 1 })
    expect('class' in shim).toBe(false)
  })
})
