import { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import type { IAgentFileOrigin } from "@/lib/db/models/AgentFile"
import { fitToPages, type FitResult } from "@/lib/pdf/fit"
import { convertHtmlToPdf, screenshotHtml, type PdfMarginsMm, type PdfRenderOptions } from "@/lib/pdf/gotenberg"
import { htmlGuardMessage } from "@/lib/pdf/html-guard"
import { countPdfPages, pageSizePx } from "@/lib/pdf/pages"
import { previewHtml } from "@/lib/pdf/preview"
import { AGENT_DOCUMENT_LIMITS as L, formatBytes } from "../constants"
import type { GeneratePdfInput } from "../schemas"
import { agentFileDownloadUrl, saveAgentFile, urlTtl } from "./store"

/**
 * Motor de PDF dos agentes (OPE-210): HTML → PDF pelo Gotenberg com ajuste a N páginas, prévia PNG
 * opcional e gravação no espaço dos agentes. Usado pelo `gerar_pdf` e pelo currículo; outras features
 * podem chamar `renderHtmlPdf` (só renderiza) ou `generateAgentPdf` (renderiza e guarda).
 */

/** Confere tamanho e recursos externos do HTML (erro acionável em pt-BR). */
export function assertRenderableHtml(html: string): void {
    const bytes = Buffer.byteLength(html)
    if (bytes > L.htmlBytes) throw new DomainError(413, `O HTML tem ${formatBytes(bytes)}; o limite é ${formatBytes(L.htmlBytes)}. Reduza o documento ou as imagens embutidas.`, "AGENT_PDF_HTML_TOO_LARGE")
    const guard = htmlGuardMessage(html)
    if (guard) throw new DomainError(400, guard, "AGENT_PDF_HTML_EXTERNAL")
}

export interface RenderHtmlPdfInput {
    html: string
    options: Omit<PdfRenderOptions, "scale">
    /** Sem `maxPages`, renderiza uma vez na escala máxima. */
    maxPages?: number
    minScale?: number
    maxScale?: number
    maxAttempts?: number
    signal?: AbortSignal
}

/** Renderiza o PDF, ajustando a escala para caber em `maxPages` quando pedido. */
export async function renderHtmlPdf(input: RenderHtmlPdfInput): Promise<FitResult<Buffer>> {
    assertRenderableHtml(input.html)
    const render = async (scale: number) => {
        const pdf = await convertHtmlToPdf(input.html, { ...input.options, scale }, input.signal)
        const pages = countPdfPages(pdf)
        if (pages < 1) throw new DomainError(502, "Não foi possível contar as páginas do PDF gerado pelo Gotenberg", "AGENT_PDF_PAGES_UNKNOWN")
        return { pages, output: pdf }
    }
    const maxScale = input.maxScale ?? 1
    if (!input.maxPages) {
        const once = await render(maxScale)
        return { output: once.output, scale: maxScale, pages: once.pages, fits: true, attempts: 1 }
    }
    return fitToPages(render, { maxPages: input.maxPages, minScale: input.minScale, maxScale, maxAttempts: input.maxAttempts })
}

export function assertPdfSize(pdf: Buffer): void {
    if (pdf.length > L.pdfBytes) throw new DomainError(413, `O PDF gerado tem ${formatBytes(pdf.length)}; o limite é ${formatBytes(L.pdfBytes)}. Reduza imagens ou páginas.`, "AGENT_PDF_TOO_LARGE")
}

/** PNG da primeira página, com as margens e a escala do PDF. */
export function renderPreviewPng(html: string, page: { options: Omit<PdfRenderOptions, "scale">; scale: number; marginsMm?: PdfMarginsMm }, signal?: AbortSignal): Promise<Buffer> {
    const size = pageSizePx(page.options.format, page.options.orientation)
    return screenshotHtml(previewHtml(html, { marginsMm: page.marginsMm ?? page.options.marginsMm, scale: page.scale }), size, signal)
}

export const withExtension = (name: string, extension: string) => (name.toLowerCase().endsWith(`.${extension}`) ? name : `${name}.${extension}`)

export interface GeneratePdfResult {
    id: string
    nome: string
    paginas: number
    tamanho: number
    coube: boolean
    escala: number
    aviso?: string
    url: string
    expiraEm: string
    previa?: { id: string; url: string }
}

export async function generateAgentPdf(input: GeneratePdfInput, context: { origin: IAgentFileOrigin; actorId: string; signal?: AbortSignal }): Promise<GeneratePdfResult> {
    const margins = input.margens ?? { topo: 10, direita: 10, baixo: 10, esquerda: 10 }
    const options: Omit<PdfRenderOptions, "scale"> = {
        format: input.formato,
        orientation: input.orientacao,
        marginsMm: { top: margins.topo, right: margins.direita, bottom: margins.baixo, left: margins.esquerda },
        background: input.fundo,
        preferCssPageSize: input.usarCssDaPagina,
    }
    const result = await renderHtmlPdf({ html: input.html, options, maxPages: input.maxPaginas, minScale: input.escalaMinima, signal: context.signal })
    assertPdfSize(result.output)
    const name = withExtension(input.nome ?? `documento-${new Date().toISOString().slice(0, 10)}`, "pdf")
    // A prévia é gerada antes de qualquer gravação (como no currículo): falha nela não deixa PDF órfão.
    const png = input.previaPng ? await renderPreviewPng(input.html, { options, scale: result.scale }, context.signal) : null
    const id = new Types.ObjectId()
    const saved = await saveAgentFile({
        id,
        name,
        mimeType: "application/pdf",
        body: result.output,
        kind: "pdf",
        origin: context.origin,
        metadata: input.metadados,
        pages: result.pages,
        pdf: { format: input.formato, orientation: input.orientacao, scale: result.scale, fits: result.fits, maxPages: input.maxPaginas ?? result.pages },
        actorId: context.actorId,
    })
    const ttl = await urlTtl(input.validadeMinutos)
    let preview: { id: string; url: string } | undefined
    if (png) {
        const savedPng = await saveAgentFile({ name: withExtension(name.replace(/\.pdf$/i, ""), "png"), mimeType: "image/png", body: png, origin: context.origin, metadata: input.metadados, parentId: id, actorId: context.actorId })
        preview = { id: String(savedPng._id), url: await agentFileDownloadUrl(savedPng, ttl.seconds) }
    }
    return {
        id: String(saved._id),
        nome: saved.name,
        paginas: result.pages,
        tamanho: result.output.length,
        coube: result.fits,
        escala: result.scale,
        ...(result.warning ? { aviso: result.warning } : {}),
        url: await agentFileDownloadUrl(saved, ttl.seconds),
        expiraEm: ttl.expiresAt.toISOString(),
        ...(preview ? { previa: preview } : {}),
    }
}
