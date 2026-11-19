import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api', () => ({ api: {} }))

import { SHARED_MODULE_IDS, isSharedModule, isUnknownSharedModule } from '@/features/plugins/shared-modules'

/**
 * Tabela de módulos compartilhados (OPE-172): a lista do compilador, os carregadores do navegador e
 * os exports do SDK (`plugin-sdk/shared-exports.json`, usados nos stubs dos testes do plugin) batem.
 */
describe('módulos compartilhados', () => {
  it('cada módulo do compilador tem carregador no navegador (menos @opex/api, que vem do contexto)', async () => {
    const source = readFileSync(path.join(process.cwd(), 'src/features/plugins/client/shared-registry.ts'), 'utf8')
    const loaders = [...source.matchAll(/^ {4}"([^"]+)": \(\) => import\(/gm)].map((match) => match[1])
    expect([...loaders].sort()).toEqual(SHARED_MODULE_IDS.filter((id) => id !== '@opex/api').sort())
  })

  it('o SDK conhece todos os módulos @opex/ (menos api e plugin-sdk) e cada um existe no app', () => {
    const exportsTable = JSON.parse(readFileSync(path.join(process.cwd(), 'plugin-sdk/shared-exports.json'), 'utf8')) as Record<string, string[]>
    const expected = SHARED_MODULE_IDS.filter((id) => id.startsWith('@opex/') && id !== '@opex/api' && !id.startsWith('@opex/plugin-sdk'))
    expect(Object.keys(exportsTable).sort()).toEqual([...expected].sort())
  })

  it('distingue módulo do shell, módulo do Opex inexistente e dependência externa', () => {
    expect(isSharedModule('react')).toBe(true)
    expect(isSharedModule('@opex/ui/card')).toBe(true)
    expect(isUnknownSharedModule('@opex/ui/inexistente')).toBe(true)
    expect(isSharedModule('lodash')).toBe(false)
    expect(isUnknownSharedModule('lodash')).toBe(false)
  })
})
