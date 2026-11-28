/**
 * Ajuste de um documento a N páginas (módulo PURO, OPE-210): reduz a escala de renderização até caber.
 *
 * 1. Renderiza na escala máxima (padrão 1). Cabe? Termina.
 * 2. Renderiza na escala mínima. Não cabe nem assim? Devolve esse resultado com `fits: false` e aviso.
 * 3. Busca binária entre as duas (precisão 0,01) e fica com a **maior** escala que cabe.
 *
 * O número de renderizações nunca passa de `maxAttempts` (padrão 6, teto 8). A renderização em si é
 * injetada (`render`), para o mesmo algoritmo servir a qualquer motor e ser testado sem ele.
 */

export const FIT_DEFAULT_MIN_SCALE = 0.8
export const FIT_DEFAULT_MAX_ATTEMPTS = 6
export const FIT_MAX_ATTEMPTS_LIMIT = 8
/** Menor escala aceita pelo Chromium/Gotenberg. */
export const FIT_SCALE_FLOOR = 0.1

export interface FitRender<T> {
    pages: number
    output: T
}

export interface FitOptions {
    maxPages: number
    minScale?: number
    maxScale?: number
    maxAttempts?: number
}

export interface FitResult<T> {
    output: T
    scale: number
    pages: number
    fits: boolean
    attempts: number
    warning?: string
}

const round2 = (value: number) => Math.round(value * 100) / 100

const pagesLabel = (n: number) => `${n} página${n === 1 ? "" : "s"}`

export function fitWarning(maxPages: number, scale: number, pages: number): string {
    return `Não coube em ${pagesLabel(maxPages)} nem com escala ${scale.toLocaleString("pt-BR")} (ficou com ${pagesLabel(pages)}): reduza o conteúdo.`
}

export async function fitToPages<T>(render: (scale: number) => Promise<FitRender<T>>, options: FitOptions): Promise<FitResult<T>> {
    const maxPages = Math.max(1, Math.floor(options.maxPages))
    const maxScale = round2(Math.min(2, Math.max(FIT_SCALE_FLOOR, options.maxScale ?? 1)))
    const minScale = round2(Math.min(maxScale, Math.max(FIT_SCALE_FLOOR, options.minScale ?? FIT_DEFAULT_MIN_SCALE)))
    const maxAttempts = Math.min(FIT_MAX_ATTEMPTS_LIMIT, Math.max(1, Math.floor(options.maxAttempts ?? FIT_DEFAULT_MAX_ATTEMPTS)))
    let attempts = 0
    const run = async (scale: number) => {
        attempts++
        const rendered = await render(scale)
        if (!Number.isFinite(rendered.pages) || rendered.pages < 1) throw new Error("Não foi possível contar as páginas do PDF gerado")
        return rendered
    }

    const first = await run(maxScale)
    if (first.pages <= maxPages) return { output: first.output, scale: maxScale, pages: first.pages, fits: true, attempts }
    if (attempts >= maxAttempts || minScale >= maxScale) return { output: first.output, scale: maxScale, pages: first.pages, fits: false, attempts, warning: fitWarning(maxPages, maxScale, first.pages) }

    const smallest = await run(minScale)
    if (smallest.pages > maxPages) return { output: smallest.output, scale: minScale, pages: smallest.pages, fits: false, attempts, warning: fitWarning(maxPages, minScale, smallest.pages) }

    let best = { output: smallest.output, scale: minScale, pages: smallest.pages }
    let low = minScale
    let high = maxScale
    while (attempts < maxAttempts) {
        const mid = round2((low + high) / 2)
        if (mid <= low || mid >= high) break
        const rendered = await run(mid)
        if (rendered.pages <= maxPages) {
            best = { output: rendered.output, scale: mid, pages: rendered.pages }
            low = mid
        } else {
            high = mid
        }
    }
    return { ...best, fits: true, attempts }
}
