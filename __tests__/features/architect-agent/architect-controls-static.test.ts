import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Telas do Agente Arquiteto usam só os controles do design system do projeto (`@/components/ui/*`):
 * nada de `<select>`/`<input type="checkbox">` nativos nem primitivos do Radix sem a camada de tema.
 */

const ROOT = join(process.cwd(), 'src/features/architect-agent/components')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : path.endsWith('.tsx') ? [path] : []
  })
}

describe('controles das telas do Agente Arquiteto', () => {
  const sources = files(ROOT).map((path) => ({ path, text: readFileSync(path, 'utf8') }))

  it('encontra os componentes', () => {
    expect(sources.length).toBeGreaterThan(5)
  })

  it.each(['<select', 'type="checkbox"', "type='checkbox'", '<input', '@radix-ui/'])('nenhum componente usa %s', (pattern) => {
    expect(sources.filter((source) => source.text.includes(pattern)).map((source) => source.path)).toEqual([])
  })
})
