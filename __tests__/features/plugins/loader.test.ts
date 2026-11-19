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
    expect(source).toContain('export default (m.default ?? m);')
    expect(source).toContain('export const { useState } = m;')
    expect(source).not.toContain('nao-identificador')
  })
})
