import { describe, expect, it, vi } from 'vitest'
import { fitToPages } from '@/lib/pdf/fit'

/** Renderização falsa: o documento cabe em 1 página a partir de `threshold` para baixo. */
const renderer = (threshold: number, pagesAbove = 2) =>
  vi.fn(async (scale: number) => ({ pages: scale <= threshold ? 1 : pagesAbove, output: `pdf@${scale}` }))

describe('fitToPages (OPE-210)', () => {
  it('cabe na primeira renderização: uma tentativa, escala 1', async () => {
    const render = renderer(1)
    const result = await fitToPages(render, { maxPages: 1 })
    expect(result).toMatchObject({ fits: true, scale: 1, pages: 1, attempts: 1, output: 'pdf@1' })
    expect(render).toHaveBeenCalledTimes(1)
  })

  it('não cabe: devolve a maior escala que cabe (busca binária)', async () => {
    const render = renderer(0.97)
    const result = await fitToPages(render, { maxPages: 1, minScale: 0.8, maxAttempts: 8 })
    expect(result.fits).toBe(true)
    expect(result.scale).toBe(0.97)
    expect(result.output).toBe('pdf@0.97')
    expect(result.warning).toBeUndefined()
  })

  it('não cabe nem na escala mínima: devolve o resultado mínimo com aviso', async () => {
    const render = renderer(0.5, 3)
    const result = await fitToPages(render, { maxPages: 1, minScale: 0.8 })
    expect(result.fits).toBe(false)
    expect(result.scale).toBe(0.8)
    expect(result.pages).toBe(3)
    expect(result.warning).toContain('Não coube em 1 página nem com escala 0,8')
    expect(render).toHaveBeenCalledTimes(2)
  })

  it('respeita o teto de tentativas (e o limite técnico de 8)', async () => {
    const render = renderer(0.81)
    const result = await fitToPages(render, { maxPages: 1, minScale: 0.5, maxAttempts: 4 })
    expect(render).toHaveBeenCalledTimes(4)
    expect(result.attempts).toBe(4)
    expect(result.fits).toBe(true)

    const many = renderer(0.6)
    await fitToPages(many, { maxPages: 1, minScale: 0.5, maxAttempts: 50 })
    expect(many.mock.calls.length).toBeLessThanOrEqual(8)
  })

  it('contagem de páginas impossível vira erro, nunca "cabe"', async () => {
    await expect(fitToPages(async () => ({ pages: 0, output: '' }), { maxPages: 1 })).rejects.toThrow('Não foi possível contar as páginas')
  })
})
