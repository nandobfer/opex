import { DomainError } from "@/lib/api/route"

/**
 * Tradução do envelope de erro do Engramind (`{ error: { code, message, details } }`) para
 * `DomainError` com mensagem pt-BR acionável. Decide pelo `code` (estável), nunca pela `message`.
 */

export interface EngramindErrorBody {
    code: string
    message?: string
    details?: unknown
}

type Details = Record<string, unknown>
const asDetails = (details: unknown): Details => (details && typeof details === "object" ? (details as Details) : {})
const list = (value: unknown) => (Array.isArray(value) ? value.map(String).join(", ") : "")

const MESSAGES: Record<string, (details: Details, retryAfter: string | null) => string> = {
    AUTH_INVALID: () => "O Engramind recusou o token do Opex (ausente, inválido, expirado, revogado ou de app desativado). Reconfigure o token na aba Conexão.",
    SCOPE_REQUIRED: (d) =>
        `O token do Opex não tem permissão para esta operação${d.required_kind ? ` (exige ${String(d.required_kind)}` : ""}${d.required_scope ? ` com ${String(d.required_scope)})` : d.required_kind ? ")" : ""}. Reconfigure o token com admin read+write+delete.`,
    CHANNEL_NOT_SUBSCRIBED: (d) => `O token não alcança o canal${d.channel ? ` ${String(d.channel)}` : ""}.`,
    LAST_ADMIN_TOKEN: () => "A rede ficaria sem nenhum token admin ativo com write. Emita outro token admin antes.",
    SLUG_ALREADY_EXISTS: () => "Já existe um registro com esse slug. Escolha outro.",
    SUBSCRIPTION_EXISTS: () => "O agente já assina esse alvo.",
    CATEGORY_IN_USE: (d) => `Há memórias usando a categoria retirada${d.in_use !== undefined ? ` (${typeof d.in_use === "object" ? JSON.stringify(d.in_use) : String(d.in_use)})` : ""}. Mova ou recategorize essas memórias antes.`,
    CATEGORY_NOT_FOUND: (d) => `Categoria fora da lista${d.valid ? ` (aceitas: ${list(d.valid)})` : ""}${d.index !== undefined ? `; item ${Number(d.index) + 1}` : ""}.`,
    SETTING_UNKNOWN: (d) => `Configuração desconhecida${d.valid ? `; aceitas: ${list(d.valid)}` : ""}.`,
    SETTING_INVALID: (d) => `Valor fora da regra da configuração${Object.keys(d).length ? ` (${JSON.stringify(d)})` : ""}. Nada foi gravado.`,
    SETTING_IS_SECRET: () => "Essa chave é um segredo: grave pela aba Provedores.",
    SECRET_UNKNOWN: (d) => `Segredo desconhecido${d.valid ? `; aceitos: ${list(d.valid)}` : ""}.`,
    PROVIDER_NOT_CONFIGURED: (d) => `Provedor sem configuração completa${d.missing ? `: faltam ${list(d.missing)}` : ""}. Nada foi gravado.`,
    PROVIDER_REJECTED: (d) => {
        const reason = d.reason ? String(d.reason) : null
        const temperatureHint = reason && /temperature/i.test(reason) ? " Deixe a Temperatura vazia (padrão do modelo)." : ""
        return `O provedor recusou a requisição${reason ? `: ${reason}` : ""}. Corrija modelo, chave ou parâmetro; repetir não resolve.${temperatureHint}`
    },
    PROVIDER_FAILED: (d) => `O provedor está indisponível ou respondeu de forma inválida${d.reason ? ` (${String(d.reason)})` : d.outcome ? ` (${String(d.outcome)})` : ""}. Tente de novo ou acrescente modelos de reserva; nada foi gravado.`,
    EMBEDDING_MODEL_LOADING: (d) => {
        const verb = d.state === "loading" ? "carregando" : "sendo baixado"
        const seconds = typeof d.elapsed_ms === "number" ? ` (há ${Math.round(d.elapsed_ms / 1000)} s)` : ""
        return `O modelo local${d.model ? ` ${String(d.model)}` : ""} ainda está ${verb}${seconds}. Tente de novo quando ficar pronto.`
    },
    PROVIDER_TIMEOUT: () => "O provedor não respondeu no tempo limite. Tente de novo ou aumente o tempo limite; nada foi gravado.",
    PROVIDER_LISTING_UNSUPPORTED: () => "Este provedor não lista modelos. Escolha pela documentação dele e valide com Testar embedding.",
    EMBEDDING_DIMENSION_MISMATCH: (d) => `O provedor devolveu vetores de outra dimensão${d.expected !== undefined ? ` (esperada ${String(d.expected)}, recebida ${String(d.got)})` : ""}. Ajuste ou apague embedding.dimensions.`,
    REEMBED_IN_PROGRESS: () => "Já há uma reindexação em andamento. Acompanhe o progresso no status.",
    BATCH_TOO_LARGE: (d) => `O lote passa do limite${d.max !== undefined ? ` (${String(d.received)} de no máximo ${String(d.max)})` : ""}. Divida o arquivo.`,
    IDEMPOTENCY_KEY_REQUIRED: () => "A operação exige uma chave de idempotência.",
    IDEMPOTENCY_KEY_CONFLICT: () => "A chave de idempotência já foi usada com outro conteúdo.",
    RATE_LIMITED: (_d, retryAfter) => `O Engramind limitou as requisições do Opex${retryAfter ? `; tente de novo em ${retryAfter} s` : ""}.`,
    VALIDATION_ERROR: (d) => `O Engramind recusou os dados${d.index !== undefined ? ` (item ${Number(d.index) + 1})` : ""}${d.field ? ` no campo ${String(d.field)}` : ""}.`,
    CHANNEL_NOT_ARCHIVED: () => "Só um canal arquivado pode ser excluído: arquive antes.",
    CHANNEL_ARCHIVED: () => "O canal está arquivado e não recebe escrita: restaure-o antes.",
    CHANNEL_NOT_FOUND: () => "Canal não encontrado no Engramind.",
    APP_NOT_FOUND: (d) => `App não encontrado no Engramind${d.index !== undefined ? ` (item ${Number(d.index) + 1})` : ""}.`,
    AGENT_NOT_FOUND: (d) => `Agente não encontrado no Engramind${d.index !== undefined ? ` (item ${Number(d.index) + 1})` : ""}.`,
    TOKEN_NOT_FOUND: () => "Token não encontrado no Engramind.",
    SUBSCRIPTION_NOT_FOUND: () => "Assinatura não encontrada no Engramind.",
    MEMORY_NOT_FOUND: () => "Memória não encontrada no Engramind.",
    REVISION_NOT_FOUND: () => "A memória não tem essa versão.",
    MEMORY_VERSION_CONFLICT: () => "A memória mudou enquanto você editava. Recarregue e tente de novo.",
    MEMORY_DUPLICATE: (d) => `Já existe uma memória com esse texto no canal${d.existing_id ? ` (${String(d.existing_id)})` : ""}.`,
    JOB_NOT_FOUND: () => "Job não encontrado.",
    JOB_NOT_RETRYABLE: () => "Só jobs failed voltam para a fila.",
    PAYLOAD_TOO_LARGE: () => "O corpo passou do limite do Engramind (MAX_BODY_BYTES).",
    DATABASE_UNAVAILABLE: () => "O banco do Engramind está indisponível. Tente novamente.",
    MIGRATIONS_PENDING: () => "O Engramind tem migrações pendentes e ainda não recebe tráfego. Tente novamente em instantes.",
    REQUEST_TIMEOUT: () => "O Engramind excedeu o tempo limite da requisição. Tente novamente.",
    INTERNAL_ERROR: () => "Falha inesperada no Engramind. Tente novamente.",
}

/** Status do Opex para o erro do Engramind (falhas do próprio serviço viram 502). */
function opexStatus(status: number): number {
    if (status === 401) return 409
    if (status >= 500) return 502
    return status
}

/**
 * Corpo de um 5xx trocado pelo proxy na frente do Engramind (o Cloudflare substitui o corpo das
 * respostas 5xx pela própria página/JSON): devolve o nome do erro do proxy, quando reconhecido.
 */
export function proxyMaskedError(text: string, json: unknown): string | null {
    if (json && typeof json === "object" && ("ray_id" in json || "error_name" in json || "cloudflare_error" in json)) {
        const name = (json as { error_name?: unknown; title?: unknown }).error_name ?? (json as { title?: unknown }).title
        return typeof name === "string" && name ? name : "cloudflare"
    }
    if (/cloudflare/i.test(text) && /ray id|cf-ray|cloudflare/i.test(text)) return "cloudflare"
    return null
}

export function toEngramindError(status: number, body: EngramindErrorBody | null, retryAfter: string | null = null, masked: string | null = null): DomainError {
    if (!body && status >= 500 && masked) {
        return new DomainError(502, `Um proxy (Cloudflare) escondeu a resposta HTTP ${status} do Engramind (${masked}). Veja o motivo em Operação › Chamadas ao LLM ou chame a URL de origem do Engramind.`, "ENGRAMIND_PROXY_MASKED", { status, proxyError: masked })
    }
    const code = body?.code ?? (status === 404 ? "ROUTE_NOT_FOUND" : `HTTP_${status}`)
    const details = asDetails(body?.details)
    const message = MESSAGES[code]?.(details, retryAfter) ?? body?.message ?? `O Engramind respondeu HTTP ${status}.`
    return new DomainError(opexStatus(status), message, `ENGRAMIND_${code}`, body?.details ?? undefined)
}

/** Engramind fora do ar ou inalcançável. */
export function unreachableError(reason: string): DomainError {
    return new DomainError(503, `Não foi possível falar com o Engramind (${reason}). Confira a URL base e se o serviço está no ar.`, "ENGRAMIND_UNREACHABLE")
}

export const notConfiguredError = () => new DomainError(409, "Configure a conexão com o Engramind (URL base e token) na integração.", "ENGRAMIND_NOT_CONFIGURED")

/** Código do Engramind de um `DomainError` traduzido (sem o prefixo). */
export const engramindCodeOf = (error: unknown): string | null =>
    error instanceof DomainError && error.code?.startsWith("ENGRAMIND_") ? error.code.slice("ENGRAMIND_".length) : null
