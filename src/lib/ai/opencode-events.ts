/**
 * Eventos do OpenCode 2.x (`event.subscribe`, SSE global) normalizados para as sessões longas do
 * app (desenvolvimento agêntico). Módulo PURO: sem rede, testável. Os payloads do servidor são
 * lidos de forma defensiva — o contrato da 2.x ainda muda entre versões.
 */

export interface OpencodeTokenUsage {
    input: number
    output: number
    reasoning: number
}

export interface OpencodeFormFieldOption {
    value: string
    label: string
    description?: string
}

/** Campo de formulário do agente (pergunta), no formato que a tela desenha. */
export interface OpencodeFormFieldDto {
    key: string
    type: "string" | "number" | "integer" | "boolean" | "multiselect" | "external"
    title: string | null
    description: string | null
    required: boolean
    options: OpencodeFormFieldOption[]
    /** Com opções: aceita também texto livre. */
    custom: boolean
    placeholder: string | null
    defaultValue: string | number | boolean | string[] | null
    url: string | null
}

export interface OpencodeFormDto {
    id: string
    title: string
    fields: OpencodeFormFieldDto[]
}

export interface OpencodePermissionDto {
    id: string
    action: string
    resources: string[]
    message: string | null
}

export type OpencodeSessionEvent =
    | { kind: "text"; delta: string }
    | { kind: "reasoning" }
    | { kind: "tool-start"; id: string; name: string }
    | { kind: "tool-called"; id: string; input: Record<string, unknown> }
    | { kind: "tool-progress"; id: string; output: string | null }
    | { kind: "tool-done"; id: string; output: string }
    | { kind: "tool-error"; id: string; message: string; output: string }
    | { kind: "step"; costUsd: number; tokens: OpencodeTokenUsage }
    | { kind: "notice"; message: string }
    | { kind: "permission"; permission: OpencodePermissionDto }
    | { kind: "permission-replied"; id: string }
    | { kind: "form"; form: OpencodeFormDto }
    | { kind: "form-closed"; id: string }
    | { kind: "moved"; directory: string }
    | { kind: "end"; outcome: "succeeded" }
    | { kind: "end"; outcome: "failed"; message: string }
    | { kind: "end"; outcome: "interrupted"; reason: string }

type Raw = Record<string, unknown>
const isObj = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value)
const str = (value: unknown): string | null => (typeof value === "string" ? value : null)
const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0)
const errorMessage = (value: unknown, fallback: string) => (isObj(value) ? (str(value.message) ?? fallback) : fallback)

/** Sessão do evento: `form.created` traz em `data.form.sessionID`; os demais, em `data.sessionID`. */
export function opencodeEventSessionId(event: unknown): string | null {
    if (!isObj(event) || !isObj(event.data)) return null
    const data = event.data
    if (event.type === "form.created" && isObj(data.form)) return str(data.form.sessionID)
    return str(data.sessionID)
}

/** Texto das partes de conteúdo de uma ferramenta (`[{ type: "text", text }]`). */
export function toolContentText(content: unknown): string {
    if (!Array.isArray(content)) return ""
    return content
        .map((part) => {
            if (!isObj(part)) return ""
            if (part.type === "text") return str(part.text) ?? ""
            if (part.type === "file") return `[arquivo ${str(part.name) ?? str(part.uri) ?? ""}]`
            return ""
        })
        .filter(Boolean)
        .join("\n")
}

const FIELD_TYPES = ["string", "number", "integer", "boolean", "multiselect", "external"] as const

function toFormField(raw: unknown): OpencodeFormFieldDto | null {
    if (!isObj(raw) || typeof raw.key !== "string" || raw.hidden === true) return null
    const type = FIELD_TYPES.find((item) => item === raw.type)
    if (!type) return null
    const options = Array.isArray(raw.options)
        ? raw.options.filter(isObj).map((option) => ({
              value: String(option.value ?? ""),
              label: String(option.label ?? option.value ?? ""),
              ...(typeof option.description === "string" ? { description: option.description } : {}),
          }))
        : []
    const fallback = raw.default
    const defaultValue =
        typeof fallback === "string" || typeof fallback === "number" || typeof fallback === "boolean"
            ? fallback
            : Array.isArray(fallback)
              ? fallback.filter((item): item is string => typeof item === "string")
              : null
    return {
        key: raw.key,
        type,
        title: str(raw.title),
        description: str(raw.description),
        required: raw.required === true,
        options,
        custom: raw.custom === true,
        placeholder: str(raw.placeholder),
        defaultValue,
        url: str(raw.url),
    }
}

export function toOpencodeForm(raw: unknown): OpencodeFormDto | null {
    if (!isObj(raw) || typeof raw.id !== "string") return null
    const fields = Array.isArray(raw.fields) ? raw.fields.map(toFormField).filter((field): field is OpencodeFormFieldDto => field !== null) : []
    return { id: raw.id, title: str(raw.title) ?? "Pergunta do agente", fields }
}

export function toOpencodePermission(raw: unknown): OpencodePermissionDto | null {
    if (!isObj(raw) || typeof raw.id !== "string") return null
    return {
        id: raw.id,
        action: str(raw.action) ?? "ferramenta",
        resources: Array.isArray(raw.resources) ? raw.resources.filter((item): item is string => typeof item === "string") : [],
        message: str(raw.message),
    }
}

/** Evento do servidor → evento da sessão. `null` = de outra sessão ou sem interesse aqui. */
export function normalizeOpencodeEvent(event: unknown, sessionId: string): OpencodeSessionEvent | null {
    if (!isObj(event) || typeof event.type !== "string" || !isObj(event.data)) return null
    if (opencodeEventSessionId(event) !== sessionId) return null
    const data = event.data
    const id = str(data.id)
    switch (event.type) {
        case "session.text.delta": {
            const delta = str(data.delta)
            return delta ? { kind: "text", delta } : null
        }
        case "session.reasoning.started":
        case "session.reasoning.delta":
            return { kind: "reasoning" }
        case "session.tool.input.started":
            return id ? { kind: "tool-start", id, name: str(data.name) ?? "ferramenta" } : null
        case "session.tool.called":
            return id ? { kind: "tool-called", id, input: isObj(data.input) ? data.input : {} } : null
        case "session.tool.progress": {
            if (!id) return null
            const meta = isObj(data.metadata) ? data.metadata : {}
            return { kind: "tool-progress", id, output: str(meta.output) }
        }
        case "session.tool.success": {
            if (!id) return null
            const meta = isObj(data.metadata) ? data.metadata : {}
            return { kind: "tool-done", id, output: toolContentText(data.content) || (str(meta.output) ?? "") }
        }
        case "session.tool.failed":
            return id ? { kind: "tool-error", id, message: errorMessage(data.error, "Falha na ferramenta"), output: toolContentText(data.content) } : null
        case "session.step.ended": {
            const tokens = isObj(data.tokens) ? data.tokens : {}
            return { kind: "step", costUsd: num(data.cost), tokens: { input: num(tokens.input), output: num(tokens.output), reasoning: num(tokens.reasoning) } }
        }
        case "session.step.failed":
            return { kind: "notice", message: `Passo do modelo falhou: ${errorMessage(data.error, "erro desconhecido")}` }
        case "session.retry.scheduled":
            return { kind: "notice", message: `Nova tentativa (${num(data.attempt)}) após falha do provedor: ${errorMessage(data.error, "erro desconhecido")}` }
        case "session.execution.succeeded":
            return { kind: "end", outcome: "succeeded" }
        case "session.execution.failed":
            return { kind: "end", outcome: "failed", message: errorMessage(data.error, "O agente terminou com erro") }
        case "session.execution.interrupted":
            return { kind: "end", outcome: "interrupted", reason: str(data.reason) ?? "user" }
        case "permission.asked": {
            const permission = toOpencodePermission(data)
            return permission ? { kind: "permission", permission } : null
        }
        case "permission.replied": {
            const requestId = str(data.requestID)
            return requestId ? { kind: "permission-replied", id: requestId } : null
        }
        case "form.created": {
            const form = toOpencodeForm(data.form)
            return form ? { kind: "form", form } : null
        }
        case "form.replied":
        case "form.cancelled":
            return id ? { kind: "form-closed", id } : null
        case "session.moved": {
            const location = isObj(data.location) ? data.location : {}
            const directory = str(location.directory)
            return directory ? { kind: "moved", directory } : null
        }
        default:
            return null
    }
}

/** Resumo curto da entrada de uma ferramenta (comando, arquivo, padrão…), para a linha da tela. */
export function describeToolInput(input: Record<string, unknown>): string | null {
    for (const key of ["command", "filePath", "file_path", "path", "pattern", "url", "query", "description", "directory"]) {
        const value = input[key]
        if (typeof value === "string" && value.trim()) return value.trim().slice(0, 500)
    }
    return null
}

/** `provedor/modelo` → referência do OpenCode (o id do modelo pode ter barras). */
export function toOpencodeModelRef(model: string, variant?: string | null): { id: string; providerID: string; variant?: string } {
    const index = model.indexOf("/")
    if (index <= 0) throw new Error(`Modelo inválido para o OpenCode: ${model} (use provedor/modelo)`)
    return { providerID: model.slice(0, index), id: model.slice(index + 1), ...(variant ? { variant } : {}) }
}
