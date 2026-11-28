import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { USAGE_BAR_COMPACT_CLASS, USAGE_BAR_COMPACT_LABEL_CLASS, USAGE_BAR_COMPACT_TRACK_ROW_CLASS } from '@/components/metrics/usage-bar-layout'
import { CONTAINER_GRID, CONTAINER_USAGE_CLASS } from '@/features/environments/components/card/environment-card-layout'

/**
 * Coluna Recursos (OPE-218) com o CSS real: as classes das constantes passam pelo compilador do Tailwind 4 do app
 * (tema padrão + utilidades, sem o navegador) e o teste confere as propriedades geradas — grade de 4 colunas a
 * partir de `sm`, 2×2 abaixo, coluna de 16rem no `md` e a largura que sobra para cada barra.
 *
 * O que este teste NÃO prova: medida de leiaute renderizado (truncamento real do texto, sobreposição, altura
 * final da linha). Isso só se confere no navegador, em /ambientes, com ambientes no Servidor e no PC, em largura
 * estreita (< 640 px), média (768–1023 px) e larga.
 */

type Compiler = { build(candidates: string[]): string }

async function compileClasses(classes: string[]): Promise<string> {
  const { compile } = (await import('tailwindcss')) as unknown as { compile: (css: string, options: { base: string; loadStylesheet: (id: string, base: string) => Promise<{ path: string; base: string; content: string }> }) => Promise<Compiler> }
  const require = createRequire(path.join(process.cwd(), 'package.json'))
  const compiler = await compile('@import "tailwindcss/theme.css" theme(reference);\n@import "tailwindcss/utilities.css" layer(utilities);', {
    base: process.cwd(),
    loadStylesheet: async (id, base) => {
      const file = require.resolve(id, { paths: [base] })
      return { path: file, base: path.dirname(file), content: await readFile(file, 'utf8') }
    },
  })
  return compiler.build(classes)
}

const tokens = (...classNames: string[]) => classNames.flatMap((name) => name.split(/\s+/)).filter(Boolean)

/** Bloco de regra de um seletor de classe (escapado como o Tailwind gera). */
function ruleOf(css: string, className: string): string {
  const selector = `.${className.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`)}`
  const start = css.indexOf(`${selector} {`)
  expect(start, `classe sem CSS gerado: ${className}`).toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf('}', start) + 1)
}

/** Texto do `@media` que envolve a regra de uma classe responsiva. */
function mediaOf(css: string, className: string): string {
  const rule = ruleOf(css, className)
  const at = css.lastIndexOf('@media', css.indexOf(rule))
  return css.slice(at, css.indexOf('{', at))
}

describe('coluna Recursos com o CSS real do Tailwind (OPE-218)', () => {
  it('a grade das barras é 2×2 abaixo de sm e 4 colunas a partir de sm (40rem)', async () => {
    const css = await compileClasses(tokens(CONTAINER_USAGE_CLASS))
    expect(ruleOf(css, 'grid')).toContain('display: grid')
    expect(ruleOf(css, 'grid-cols-2')).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))')
    expect(ruleOf(css, 'sm:grid-cols-4')).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))')
    expect(mediaOf(css, 'sm:grid-cols-4')).toMatch(/width >= 40rem|min-width: 40rem/)
    expect(ruleOf(css, 'gap-x-2')).toMatch(/column-gap: calc\(var\(--spacing(, 0\.25rem)?\) \* 2\)/)
  })

  it('no md a linha do container tem a coluna Recursos fixa de 16rem: cerca de 58 px por barra', async () => {
    const css = await compileClasses(tokens(CONTAINER_GRID.owner))
    const columns = CONTAINER_GRID.owner.split(/\s+/).find((name) => name.startsWith('md:grid-cols-'))!
    const rule = ruleOf(css, columns)
    expect(rule).toContain('grid-template-columns: minmax(0,1.1fr) minmax(0,1fr) minmax(0,2fr) 16rem')
    expect(mediaOf(css, columns)).toMatch(/width >= 48rem|min-width: 48rem/)
    // 16rem menos 3 espaços de gap-x-2 (0,5rem) divididos por 4, com 1rem = 16 px.
    const perBar = ((16 - 3 * 0.5) / 4) * 16
    expect(perBar).toBeGreaterThanOrEqual(55)
  })

  it('as classes da célula compacta geram CSS (faixa da trilha de altura fixa, rótulo de 10px)', async () => {
    const css = await compileClasses(tokens(USAGE_BAR_COMPACT_CLASS, USAGE_BAR_COMPACT_LABEL_CLASS, USAGE_BAR_COMPACT_TRACK_ROW_CLASS))
    expect(ruleOf(css, 'h-2.5')).toMatch(/height: calc\(var\(--spacing(, 0\.25rem)?\) \* 2\.5\)/)
    expect(ruleOf(css, 'text-[10px]')).toContain('font-size: 10px')
    expect(ruleOf(css, 'min-w-0')).toMatch(/min-width: (0|calc\(var\(--spacing(, 0\.25rem)?\) \* 0\))/)
  })
})
