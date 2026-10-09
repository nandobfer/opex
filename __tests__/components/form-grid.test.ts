import { describe, expect, it } from 'vitest'
import { FORM_GRID, FORM_GRID_3, FORM_GRID_COMPACT, FORM_GRID_WIDE } from '@/components/ui/form-grid'

describe('form-grid (campos ocupam toda a largura)', () => {
  it('todas as grades têm 2 colunas e esticam o último campo sozinho na linha inteira', () => {
    for (const grid of [FORM_GRID, FORM_GRID_COMPACT, FORM_GRID_WIDE]) {
      expect(grid).toContain('sm:grid-cols-2')
      expect(grid).toContain('sm:[&>*:last-child:nth-child(odd)]:col-span-2')
      expect(grid).not.toMatch(/max-w-/)
    }
  })

  it('grade de 3 colunas divide a linha a partir de sm (um campo por linha abaixo)', () => {
    expect(FORM_GRID_3).toContain('sm:grid-cols-3')
    expect(FORM_GRID_3).not.toMatch(/(^|\s)grid-cols-|max-w-/)
  })
})
