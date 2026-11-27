/**
 * Medidas de página e contagem de páginas de PDF (módulo PURO, OPE-210).
 *
 * Os tamanhos seguem o que o Chromium do Gotenberg recebe (`paperWidth`/`paperHeight` em polegadas).
 */

export const PDF_FORMATS = ["A4", "Carta"] as const
export type PdfFormat = (typeof PDF_FORMATS)[number]

export const PDF_ORIENTATIONS = ["retrato", "paisagem"] as const
export type PdfOrientation = (typeof PDF_ORIENTATIONS)[number]

/** Tamanho em polegadas (retrato). */
export const PAGE_SIZES_IN: Record<PdfFormat, { width: number; height: number }> = {
    A4: { width: 8.27, height: 11.69 },
    Carta: { width: 8.5, height: 11 },
}

export const MM_PER_INCH = 25.4
/** Pixels CSS por polegada (o Chromium imprime a 96 dpi). */
export const CSS_PX_PER_INCH = 96

export const mmToInches = (mm: number): number => Math.round((mm / MM_PER_INCH) * 10_000) / 10_000
export const inchesToPx = (inches: number): number => Math.round(inches * CSS_PX_PER_INCH)
export const mmToPx = (mm: number): number => inchesToPx(mm / MM_PER_INCH)

/** Tamanho da página em polegadas, já com a orientação aplicada. */
export function pageSizeInches(format: PdfFormat, orientation: PdfOrientation = "retrato"): { width: number; height: number } {
    const size = PAGE_SIZES_IN[format]
    return orientation === "paisagem" ? { width: size.height, height: size.width } : { ...size }
}

/** Tamanho da página em px CSS (usado na prévia PNG). */
export function pageSizePx(format: PdfFormat, orientation: PdfOrientation = "retrato"): { width: number; height: number } {
    const size = pageSizeInches(format, orientation)
    return { width: inchesToPx(size.width), height: inchesToPx(size.height) }
}

/**
 * Quantidade de páginas de um PDF: conta os objetos `/Type /Page` (sem o `/Pages` da árvore). Vale para
 * a saída do Chromium (Skia), que grava os dicionários de página sem compressão. `0` significa que a
 * contagem não foi possível (ex.: object streams comprimidos): quem chama trata como erro, nunca como
 * "cabe".
 */
export function countPdfPages(pdf: Uint8Array | Buffer): number {
    const text = Buffer.from(pdf.buffer, pdf.byteOffset, pdf.byteLength).toString("latin1")
    const matches = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g)
    return matches ? matches.length : 0
}
