import { describe, expect, it } from 'vitest'
import { countPdfPages, mmToInches, pageSizeInches, pageSizePx } from '@/lib/pdf/pages'

const fakePdf = (pages: number) => Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Pages /Count ${pages} >>\n${'2 0 obj << /Type /Page /Parent 1 0 R >>\n'.repeat(pages)}%%EOF`, 'latin1')

describe('pages (OPE-210)', () => {
  it('conta as páginas do PDF sem contar a árvore /Pages', () => {
    expect(countPdfPages(fakePdf(1))).toBe(1)
    expect(countPdfPages(fakePdf(2))).toBe(2)
    expect(countPdfPages(Buffer.from('<</Type/Page/Parent 3 0 R>><</Type/Page>>', 'latin1'))).toBe(2)
  })

  it('PDF sem página conhecida devolve 0 (quem chama trata como erro)', () => {
    expect(countPdfPages(Buffer.from('%PDF-1.7 /Type /Pages /ObjStm', 'latin1'))).toBe(0)
  })

  it('tamanhos A4 e Carta, com a orientação aplicada', () => {
    expect(pageSizeInches('A4')).toEqual({ width: 8.27, height: 11.69 })
    expect(pageSizeInches('Carta', 'paisagem')).toEqual({ width: 11, height: 8.5 })
    expect(pageSizePx('A4')).toEqual({ width: 794, height: 1122 })
    expect(mmToInches(25.4)).toBe(1)
  })
})
