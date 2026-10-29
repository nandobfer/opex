import { formatAttachmentSize } from "@/lib/attachments"
import { CHAT_FILE_KIND_LABELS, megabytesToBytes, type ChatFileKind, type ChatFilesLimits } from "@/lib/chat-files/kind"

/**
 * Anexos dos campos da mesa de trabalho (módulo puro: tela e servidor). Os limites seguem os padrões
 * do chat do Agente Opex. No turno, imagens, PDFs e textos até `AGENTIC_FILE_INLINE_MB` vão como anexo
 * do prompt do OpenCode; todos os arquivos (inclusive os demais tipos) são listados no prompt com um
 * link assinado temporário do Storage S3 para o agente baixar quando precisar.
 */

export const AGENTIC_FILES_PER_MESSAGE = 10
export const AGENTIC_FILE_SIZE_MB = 100
/** Teto por arquivo para ir como anexo do prompt (acima disso, só o link). */
export const AGENTIC_FILE_INLINE_MB = 20
/** Teto da soma dos anexos que vão no prompt de uma mensagem (o que passar fica só com o link). */
export const AGENTIC_FILES_INLINE_TOTAL_MB = 50
/** Validade do link assinado de download listado no prompt (gerado a cada turno). */
export const AGENTIC_FILE_LINK_TTL_SECONDS = 24 * 60 * 60
/** Validade da URL assinada do PUT (envio do navegador ao storage). */
export const AGENTIC_FILE_UPLOAD_URL_TTL_SECONDS = 15 * 60
/** Arquivo enviado e não usado numa mensagem é removido depois disso (limpeza oportunista). */
export const AGENTIC_FILE_PENDING_TTL_MS = 24 * 60 * 60 * 1000
/** Intervalo mínimo entre duas limpezas oportunistas dos pendentes. */
export const AGENTIC_FILE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000

export const AGENTIC_FILES_LIMITS: ChatFilesLimits = { maxPerMessage: AGENTIC_FILES_PER_MESSAGE, maxSizeMb: AGENTIC_FILE_SIZE_MB }

/** Tipos que o OpenCode lê como anexo do prompt. */
const ATTACHABLE_KINDS: ReadonlySet<ChatFileKind> = new Set(["image", "pdf", "text"])

/** Como o arquivo chega ao agente: anexo do prompt (`attached`) ou só pelo link (`link`). */
export type AgenticFileDelivery = "attached" | "link"

export function agenticFileDelivery(kind: ChatFileKind, size: number): AgenticFileDelivery {
    return ATTACHABLE_KINDS.has(kind) && size > 0 && size <= megabytesToBytes(AGENTIC_FILE_INLINE_MB) ? "attached" : "link"
}

/**
 * Escolhe quais arquivos vão como anexo do prompt: os elegíveis, na ordem, até o teto da soma. O
 * restante fica só com o link.
 */
export function pickAttachedFiles<T extends { kind: ChatFileKind; size: number }>(files: readonly T[], totalMb = AGENTIC_FILES_INLINE_TOTAL_MB): Set<T> {
    const picked = new Set<T>()
    let total = 0
    for (const file of files) {
        if (agenticFileDelivery(file.kind, file.size) !== "attached" || total + file.size > megabytesToBytes(totalMb)) continue
        picked.add(file)
        total += file.size
    }
    return picked
}

/** Pasta (fora do worktree) onde o agente baixa os anexos da mesa ou do fork. */
export function agenticDownloadDir(taskCode: string, forkNumber?: number | null): string {
    const safe = taskCode.replace(/[^a-z0-9._-]+/gi, "-") || "mesa"
    return `/tmp/opex-anexos/${safe}${forkNumber ? `/fork-${forkNumber}` : ""}`
}

/** Rota do app que serve o arquivo. */
export const agenticFilePath = (id: string) => `/api/agentic/files/${id}`

export interface PromptFileEntry {
    name: string
    mediaType: string
    size: number
    kind: ChatFileKind
    /** Também foi como anexo do prompt. */
    attached: boolean
    /** Link assinado de download (`null` = o storage não gerou o link). */
    url: string | null
}

/** Seção do prompt com os anexos da mensagem: o que já vai junto e o link de cada um, para baixar fora do worktree. */
export function attachmentsPromptSection(files: readonly PromptFileEntry[], downloadDir: string): string {
    if (!files.length) return ""
    const lines = files.map((file) => {
        const meta = `${CHAT_FILE_KIND_LABELS[file.kind]}, ${file.mediaType}, ${formatAttachmentSize(file.size)}`
        const sent = file.attached ? "já vai anexado a esta mensagem" : "não vai anexado: baixe pelo link se precisar do conteúdo"
        const link = file.url ? `link: ${file.url}` : "link indisponível (o storage não respondeu)"
        return `- \`${file.name}\` (${meta}) — ${sent}; ${link}`
    })
    return [
        "## Arquivos anexados pelo usuário",
        "",
        `O usuário anexou ${files.length === 1 ? "o arquivo abaixo" : `os ${files.length} arquivos abaixo`} a esta mensagem. Os links são temporários (valem por ${AGENTIC_FILE_LINK_TTL_SECONDS / 3600} h).`,
        `Para ler um arquivo que não vai anexado (ou ler o original), baixe-o FORA do worktree, por exemplo: \`mkdir -p ${downloadDir} && curl -fsSL -o "${downloadDir}/<nome>" "<link>"\`. Nunca copie esses arquivos para o repositório nem faça commit deles, a não ser que a tarefa peça explicitamente.`,
        "",
        ...lines,
    ].join("\n")
}

/** Texto do prompt com a seção dos anexos ao final (sem anexos, o texto não muda). */
export function withAttachmentsSection(text: string, section: string): string {
    return section ? `${text}\n\n${section}` : text
}
