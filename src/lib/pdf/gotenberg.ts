import { convertHtml, screenshotHtml as gotenbergScreenshot } from "@nandobfer/integracoes/gotenberg/server"
import { mmToInches, pageSizeInches, type PdfFormat, type PdfOrientation } from "./pages"

/**
 * Gotenberg nos documentos dos agentes (OPE-210): só o mapeamento das opções de página do Opex (formato,
 * orientação, margens em mm, escala) para os campos do formulário do Chromium. O cliente HTTP (URL, tempo
 * limite, erros `GOTENBERG_*` e debug sem o conteúdo) é o da integração da biblioteca `@nandobfer/integracoes`
 * (OPE-217), configurada só pela tela `/integracoes`.
 */

export interface PdfMarginsMm {
    top: number
    right: number
    bottom: number
    left: number
}

export interface PdfRenderOptions {
    format: PdfFormat
    orientation: PdfOrientation
    marginsMm: PdfMarginsMm
    /** Imprime cores e imagens de fundo. */
    background: boolean
    /** Usa o `@page` do CSS (tamanho e margens) no lugar do formato e das margens informados. */
    preferCssPageSize: boolean
    scale: number
}

export interface ScreenshotOptions {
    width: number
    height: number
}

const fmt = (value: number) => String(Math.round(value * 10_000) / 10_000)

/** Campos do formulário da conversão (puro, exportado para os testes). */
export function pdfFormFields(options: PdfRenderOptions): Record<string, string> {
    const size = pageSizeInches(options.format, options.orientation)
    return {
        paperWidth: fmt(size.width),
        paperHeight: fmt(size.height),
        marginTop: fmt(mmToInches(options.marginsMm.top)),
        marginRight: fmt(mmToInches(options.marginsMm.right)),
        marginBottom: fmt(mmToInches(options.marginsMm.bottom)),
        marginLeft: fmt(mmToInches(options.marginsMm.left)),
        printBackground: String(options.background),
        preferCssPageSize: String(options.preferCssPageSize),
        scale: fmt(options.scale),
    }
}

export function screenshotFormFields(options: ScreenshotOptions): Record<string, string> {
    return { width: String(Math.round(options.width)), height: String(Math.round(options.height)), clip: "true", format: "png", optimizeForSpeed: "true" }
}

export function convertHtmlToPdf(html: string, options: PdfRenderOptions, signal?: AbortSignal): Promise<Buffer> {
    return convertHtml(html, pdfFormFields(options), signal)
}

export function screenshotHtml(html: string, options: ScreenshotOptions, signal?: AbortSignal): Promise<Buffer> {
    return gotenbergScreenshot(html, screenshotFormFields(options), signal)
}
