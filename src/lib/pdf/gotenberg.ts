import { DomainError } from "@/lib/api/route"
import { getIntegration } from "@/lib/integrations/config"
import { integrationDebug } from "@/lib/integrations/debug"
import { mmToInches, pageSizeInches, type PdfFormat, type PdfOrientation } from "./pages"

/**
 * Cliente do Gotenberg (OPE-210): HTML → PDF e HTML → PNG pelo Chromium do serviço compartilhado no host
 * (rede `gotenberg-network`, `http://gotenberg:3000`). URL e tempo limite vêm da integração "Gotenberg
 * (PDF)", configurada só pela tela `/integracoes`. Envio multipart com `fetch` + `FormData` nativos.
 *
 * O debug registra só rota, tamanho do HTML, escala, status e duração — nunca o conteúdo.
 */

const INTEGRATION = "gotenberg" as const
const dbg = integrationDebug(INTEGRATION)

export const GOTENBERG_DEFAULT_TIMEOUT_SECONDS = 30

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

interface GotenbergTarget {
    baseUrl: string
    timeoutMs: number
}

async function target(): Promise<GotenbergTarget> {
    const { values } = await getIntegration(INTEGRATION)
    const baseUrl = values.url?.trim().replace(/\/+$/, "")
    if (!baseUrl) throw new DomainError(503, "A integração Gotenberg (PDF) não está configurada: informe a URL interna em Integrações › Gotenberg (PDF).", "GOTENBERG_NOT_CONFIGURED")
    const seconds = Number(values.timeoutSeconds) > 0 ? Number(values.timeoutSeconds) : GOTENBERG_DEFAULT_TIMEOUT_SECONDS
    return { baseUrl, timeoutMs: seconds * 1000 }
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

function formOf(html: string, fields: Record<string, string>): FormData {
    const form = new FormData()
    form.append("files", new Blob([html], { type: "text/html" }), "index.html")
    for (const [key, value] of Object.entries(fields)) form.append(key, value)
    return form
}

async function post(route: string, html: string, fields: Record<string, string>, signal?: AbortSignal): Promise<Buffer> {
    const { baseUrl, timeoutMs } = await target()
    const startedAt = Date.now()
    const htmlBytes = Buffer.byteLength(html)
    dbg.request(`POST ${route}`, { htmlBytes, ...fields })
    const timeout = AbortSignal.timeout(timeoutMs)
    let response: Response
    try {
        response = await fetch(`${baseUrl}${route}`, { method: "POST", body: formOf(html, fields), signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
    } catch (error) {
        dbg.error(`Falha de rede em ${route} após ${Date.now() - startedAt} ms`, error)
        if (signal?.aborted) throw error
        if (timeout.aborted) throw new DomainError(504, `O Gotenberg não respondeu em ${Math.round(timeoutMs / 1000)} s: tente de novo ou aumente o tempo limite em Integrações › Gotenberg (PDF).`, "GOTENBERG_TIMEOUT")
        throw new DomainError(502, "Não foi possível falar com o Gotenberg: confira a URL interna da integração e se o serviço está no ar.", "GOTENBERG_UNREACHABLE")
    }
    if (!response.ok) {
        const detail = (await response.text().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 200)
        dbg.error(`HTTP ${response.status} em ${route} após ${Date.now() - startedAt} ms`, undefined, { status: response.status, detail })
        throw new DomainError(502, `O Gotenberg recusou a conversão (HTTP ${response.status})${detail ? `: ${detail}` : ""}.`, "GOTENBERG_FAILED")
    }
    const body = Buffer.from(await response.arrayBuffer())
    dbg.response(`${route}: HTTP ${response.status} em ${Date.now() - startedAt} ms`, { bytes: body.length, scale: fields.scale })
    return body
}

export function convertHtmlToPdf(html: string, options: PdfRenderOptions, signal?: AbortSignal): Promise<Buffer> {
    return post("/forms/chromium/convert/html", html, pdfFormFields(options), signal)
}

export function screenshotHtml(html: string, options: ScreenshotOptions, signal?: AbortSignal): Promise<Buffer> {
    return post("/forms/chromium/screenshot/html", html, screenshotFormFields(options), signal)
}

export interface GotenbergHealth {
    status: string
    chromium: string | null
}

/** `GET /health` (teste da integração). */
export async function gotenbergHealth(signal?: AbortSignal): Promise<GotenbergHealth> {
    const { baseUrl, timeoutMs } = await target()
    const timeout = AbortSignal.timeout(Math.min(timeoutMs, 10_000))
    const response = await fetch(`${baseUrl}/health`, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
    const body = (await response.json().catch(() => null)) as { status?: unknown; details?: { chromium?: { status?: unknown } } } | null
    if (!response.ok && !body) throw new Error(`HTTP ${response.status}`)
    return {
        status: typeof body?.status === "string" ? body.status : `HTTP ${response.status}`,
        chromium: typeof body?.details?.chromium?.status === "string" ? body.details.chromium.status : null,
    }
}
