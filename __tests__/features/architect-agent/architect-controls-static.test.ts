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

  it('nós do canvas não usam tipo reservado do React Flow (group, default, input, output)', () => {
    const reserved = /type:\s*["'](group|default|input|output)["']/
    expect(sources.filter((source) => reserved.test(source.text)).map((source) => source.path)).toEqual([])
  })

  it('o skeleton e a espera ao vivo usam as classes do cabeçalho e da barra do resultado final', () => {
    const states = sources.find((source) => source.path.endsWith('ArchitectStates.tsx'))!.text
    for (const constant of ['ARCHITECT_HEADER_CLASS', 'ARCHITECT_HEADER_ROW_CLASS', 'ARCHITECT_CANVAS_TOOLBAR_CLASS', 'ARCHITECT_CANVAS_WRAP_CLASS']) expect(states).toContain(constant)
  })
})
