import { Types } from "mongoose"
import type { IAgentFileOrigin } from "@/lib/db/models/AgentFile"
import type { FitResult } from "@/lib/pdf/fit"
import type { PdfRenderOptions } from "@/lib/pdf/gotenberg"
import type { FindResumesInput, PrepareResumeInput, ResumeContent } from "../../schemas"
import { resumeContentSchema } from "../../schemas"
import { assertPdfSize, renderHtmlPdf, renderPreviewPng } from "../pdf"
import { agentFileDownloadUrl, auditAgentFileRead, containsInsensitive, exactInsensitive, findAgentFilesByIds, lookupAgentFiles, saveAgentFile, setResumeLinks, toAgentFileDto, urlTtl, type AgentFileDto } from "../store"
import { RESUME_PAGE_MARGINS_MM, renderResumeHtml, type ResumeDensity } from "./template"

/**
 * Currículo do Candidatador (OPE-210) sobre o motor de documentos: monta o HTML com o modelo aprovado
 * (fixo), gera o PDF ajustado a 1 página e guarda PDF, HTML e PNG.
 *
 * Degraus (decisão do dono): 1) densidade `padrao` (CSS exato) com escala de 1 até 0,95 — só compensa a
 * fonte Liberation Sans do Gotenberg no lugar da Arial (medido: o modelo aprovado precisa de 0,97);
 * 2) densidade `compacto` com escala de 1 até 0,80; 3) não coube: guarda assim mesmo, com `coube: false`.
 */

export const RESUME_STEPS: readonly { density: ResumeDensity; minScale: number; maxAttempts: number }[] = [
    { density: "padrao", minScale: 0.95, maxAttempts: 4 },
    { density: "compacto", minScale: 0.8, maxAttempts: 6 },
]

const RESUME_MAX_PAGES = 1

function pdfOptions(): Omit<PdfRenderOptions, "scale"> {
    // O `@page` do modelo define tamanho e margens; as margens do Gotenberg ficam zeradas.
    return { format: "A4", orientation: "retrato", marginsMm: { top: 0, right: 0, bottom: 0, left: 0 }, background: true, preferCssPageSize: true }
}

export interface ResumeRender {
    density: ResumeDensity
    html: string
    result: FitResult<Buffer>
}

/** Percorre os degraus até caber em 1 página (o último resultado vale mesmo sem caber). */
export async function renderResume(content: ResumeContent, signal?: AbortSignal): Promise<ResumeRender> {
    let last: ResumeRender | null = null
    for (const step of RESUME_STEPS) {
        const html = renderResumeHtml(content, step.density)
        const result = await renderHtmlPdf({ html, options: pdfOptions(), maxPages: RESUME_MAX_PAGES, minScale: step.minScale, maxAttempts: step.maxAttempts, signal })
        last = { density: step.density, html, result }
        if (result.fits) return last
    }
    return last!
}

const slug = (value: string) =>
    value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60)

export function resumeBaseName(input: Pick<PrepareResumeInput, "empresa" | "vaga" | "nomeArquivo">, now = new Date()): string {
    if (input.nomeArquivo) return input.nomeArquivo.replace(/\.(pdf|html|png)$/i, "")
    return [now.toISOString().slice(0, 10), slug(input.empresa), slug(input.vaga)].filter(Boolean).join("-")
}

export interface PrepareResumeResult {
    id: string
    nome: string
    paginas: number
    coube: boolean
    densidade: ResumeDensity
    escala: number
    aviso?: string
    url: string
    html: { id: string; url: string }
    previa: { id: string; url: string }
    expiraEm: string
}

export async function prepareResume(input: PrepareResumeInput, context: { origin: IAgentFileOrigin; actorId: string; signal?: AbortSignal }): Promise<PrepareResumeResult> {
    const { empresa, vaga, jobId, validadeMinutos, ...rest } = input
    // `nomeArquivo` fica de fora: o schema do conteúdo descarta chaves desconhecidas.
    const content = resumeContentSchema.parse(rest)
    const rendered = await renderResume(content, context.signal)
    assertPdfSize(rendered.result.output)
    const png = await renderPreviewPng(rendered.html, { options: pdfOptions(), scale: rendered.result.scale, marginsMm: RESUME_PAGE_MARGINS_MM[rendered.density] }, context.signal)

    const base = resumeBaseName(input)
    const metadata: Record<string, string> = { empresa, vaga, idioma: content.idioma, ...(jobId ? { jobId } : {}) }
    const pdfId = new Types.ObjectId()
    const pdf = await saveAgentFile({
        id: pdfId,
        name: `${base}.pdf`,
        mimeType: "application/pdf",
        body: rendered.result.output,
        kind: "resume",
        origin: context.origin,
        metadata,
        pages: rendered.result.pages,
        pdf: { format: "A4", orientation: "retrato", scale: rendered.result.scale, fits: rendered.result.fits, maxPages: RESUME_MAX_PAGES },
        resume: { content, language: content.idioma, density: rendered.density, htmlFileId: null, pngFileId: null },
        actorId: context.actorId,
    })
    const html = await saveAgentFile({ name: `${base}.html`, mimeType: "text/html", body: Buffer.from(rendered.html, "utf8"), origin: context.origin, metadata, parentId: pdfId, actorId: context.actorId })
    const preview = await saveAgentFile({ name: `${base}.png`, mimeType: "image/png", body: png, origin: context.origin, metadata, parentId: pdfId, actorId: context.actorId })
    await setResumeLinks(pdfId, { htmlFileId: html._id, pngFileId: preview._id })

    const ttl = await urlTtl(validadeMinutos)
    return {
        id: String(pdf._id),
        nome: pdf.name,
        paginas: rendered.result.pages,
        coube: rendered.result.fits,
        densidade: rendered.density,
        escala: rendered.result.scale,
        ...(rendered.result.warning ? { aviso: rendered.result.warning } : {}),
        url: await agentFileDownloadUrl(pdf, ttl.seconds),
        html: { id: String(html._id), url: await agentFileDownloadUrl(html, ttl.seconds) },
        previa: { id: String(preview._id), url: await agentFileDownloadUrl(preview, ttl.seconds) },
        expiraEm: ttl.expiresAt.toISOString(),
    }
}

export interface ResumeDto extends AgentFileDto {
    url: string
    html: { id: string; url: string } | null
    previa: { id: string; url: string } | null
    densidade: string | null
    conteudo: unknown
    expiraEm: string
}

/** Currículos já gerados (id, empresa, vaga, jobId, período), com URLs novas e o conteúdo usado. */
export async function findResumes(input: FindResumesInput, context: { actorId: string; tool: string }): Promise<ResumeDto[]> {
    const metadados: Record<string, string> = {}
    if (input.jobId) metadados.jobId = input.jobId
    const metadataPatterns: Record<string, RegExp> = {}
    if (input.empresa) metadataPatterns.empresa = exactInsensitive(input.empresa)
    if (input.vaga) metadataPatterns.vaga = containsInsensitive(input.vaga)
    const filtered = await lookupAgentFiles({ id: input.id, metadados: Object.keys(metadados).length ? metadados : undefined, de: input.de, ate: input.ate, limite: input.limite }, { kind: "resume", metadataPatterns })
    const children = await findAgentFilesByIds(filtered.flatMap((doc) => [doc.resume?.htmlFileId ?? null, doc.resume?.pngFileId ?? null]))
    const ttl = await urlTtl(input.validadeMinutos)
    const link = async (id: Types.ObjectId | null | undefined) => {
        const child = id ? children.get(String(id)) : undefined
        return child ? { id: String(child._id), url: await agentFileDownloadUrl(child, ttl.seconds) } : null
    }
    await auditAgentFileRead(context.actorId, filtered, context.tool)
    return Promise.all(
        filtered.map(async (doc) => ({
            ...toAgentFileDto(doc),
            url: await agentFileDownloadUrl(doc, ttl.seconds),
            html: await link(doc.resume?.htmlFileId),
            previa: await link(doc.resume?.pngFileId),
            densidade: doc.resume?.density ?? null,
            conteudo: doc.resume?.content ?? null,
            expiraEm: ttl.expiresAt.toISOString(),
        })),
    )
}
