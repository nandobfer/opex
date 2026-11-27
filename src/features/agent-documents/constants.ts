/**
 * Documentos dos agentes (OPE-210, módulo PURO): espaço reservado no bucket, limites e rótulos.
 * Ver `aicontext/modules/agent-documents.md`.
 */

/** Grupo das ferramentas no Agente Opex, nos rotineiros (motor Opex) e no MCP do dono. */
export const DOCUMENTS_TOOL_GROUP = "documents" as const

/** Espaço dos agentes no bucket: toda chave é `agent-files/<ObjectId>/<nome>`, gerada pelo servidor. */
export const AGENT_FILES_PREFIX = "agent-files/"

export const AGENT_DOCUMENTS_AUDIT_ENTITY = "DocumentoAgente"

const MB = 1024 * 1024

/** Limites (uma constante por regra; mensagens em pt-BR nos pontos de uso). */
export const AGENT_DOCUMENT_LIMITS = {
    /** HTML do `gerar_pdf`. */
    htmlBytes: 1 * MB,
    /** Conteúdo do `upload_s3` (texto ou base64 já decodificado). */
    uploadContentBytes: 5 * MB,
    /** PDF gerado (acima disso, não é gravado). */
    pdfBytes: 10 * MB,
    /** Envio direto ao bucket pela URL de envio (conferido na finalização). */
    putUploadBytes: 25 * MB,
    /** Conteúdo de texto devolvido inline pelo `get_s3`. */
    inlineTextBytes: 64 * 1024,
    metadataKeys: 20,
    metadataKeyChars: 40,
    metadataValueChars: 200,
    maxPages: 20,
    searchDefault: 10,
    searchMax: 20,
} as const

export const PDF_MIN_SCALE_FLOOR = 0.5
export const PDF_DEFAULT_MIN_SCALE = 0.8

/** Validade das URLs (min): padrões da integração Gotenberg e teto técnico do SigV4 (7 dias). */
export const URL_TTL_DEFAULT_MINUTES = 15
export const URL_TTL_MAX_DEFAULT_MINUTES = 60
export const URL_TTL_SIGV4_MAX_MINUTES = 10_080

/** Tipos devolvidos como texto inline pelo `get_s3`. */
export function isInlineTextType(mimeType: string): boolean {
    const type = mimeType.toLowerCase().split(";")[0]!.trim()
    return type.startsWith("text/") || ["application/json", "application/xml", "application/x-ndjson", "application/yaml", "image/svg+xml"].includes(type)
}

/** Tamanho legível (pt-BR). */
export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < MB) return `${(bytes / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB`
    return `${(bytes / MB).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`
}
