import type { McpConfigInput, McpOauthConfigInput, SecretPatch } from "./schemas"
import type { McpDetailDto } from "./types"

/**
 * Entradas de MCP (formato 2.x normalizado): montagem a partir do formulário sem segredos + alterações
 * de segredos, e o DTO só com os NOMES das variáveis/cabeçalhos. Módulo puro.
 */

type Json = Record<string, unknown>

const stringRecord = (value: unknown): Record<string, string> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value as Json).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
}

/**
 * Aplica alterações de segredos. `replace`: a lista é o conjunto completo (chave fora da lista sai;
 * sem valor mantém o atual). `merge`: só as chaves da lista mudam (`null` remove).
 */
export function applySecretPatches(existing: Record<string, string>, patches: readonly SecretPatch[] | undefined, mode: "replace" | "merge"): Record<string, string> {
    if (!patches) return { ...existing }
    if (mode === "merge") {
        const next = { ...existing }
        for (const patch of patches) {
            if (patch.value === null) delete next[patch.key]
            else if (typeof patch.value === "string") next[patch.key] = patch.value
        }
        return next
    }
    const next: Record<string, string> = {}
    for (const patch of patches) {
        if (patch.value === null) continue
        if (typeof patch.value === "string") next[patch.key] = patch.value
        else if (existing[patch.key] !== undefined) next[patch.key] = existing[patch.key]!
    }
    return next
}

const OWN_KEYS = new Set(["type", "command", "url", "cwd", "environment", "headers", "timeout", "disabled", "enabled", "oauth"])

type Secrets = { environment?: readonly SecretPatch[]; headers?: readonly SecretPatch[]; oauthClientSecret?: string | null }

/** `client_secret`: ausente mantém o atual, `null` remove, texto grava. */
function nextClientSecret(previous: unknown, patch: string | null | undefined): string | undefined {
    if (patch === null) return undefined
    if (typeof patch === "string" && patch) return patch
    return typeof previous === "string" && previous ? previous : undefined
}

/** Chave `oauth` do OpenCode (snake_case; campos vazios ficam de fora = padrão do OpenCode). */
export function oauthEntryOf(input: McpOauthConfigInput | undefined, previous: unknown, secretPatch: string | null | undefined): Json {
    const before = previous && typeof previous === "object" && !Array.isArray(previous) ? (previous as Json) : {}
    const out: Json = {}
    const clientId = input?.clientId?.trim()
    if (clientId) out.client_id = clientId
    const secret = clientId ? nextClientSecret(before.client_secret, secretPatch) : undefined
    if (secret) out.client_secret = secret
    if (input?.scope?.trim()) out.scope = input.scope.trim()
    if (input?.callbackPort) out.callback_port = input.callbackPort
    if (input?.redirectUri?.trim()) out.redirect_uri = input.redirectUri.trim()
    if (input?.authServerMetadataUrl?.trim()) out.auth_server_metadata_url = input.authServerMetadataUrl.trim()
    return out
}

/** Monta a entrada do MCP preservando chaves extras do OpenCode (`codemode`, `protocol`...). */
export function buildMcpEntry(input: McpConfigInput, existing: Json | undefined, secrets: Secrets | undefined, mode: "replace" | "merge"): Json {
    const previous = existing && existing.type === input.type ? existing : {}
    const extra = Object.fromEntries(Object.entries(previous).filter(([key]) => !OWN_KEYS.has(key)))
    const base: Json = { ...extra, type: input.type, disabled: input.disabled === true }
    // Sem timeout no formulário, o configurado no arquivo continua (o formulário não edita o timeout).
    const timeout = input.timeout ?? (previous.timeout && typeof previous.timeout === "object" ? previous.timeout : undefined)
    if (timeout && Object.keys(timeout).length) base.timeout = timeout
    if (input.type === "local") {
        base.command = [...input.command]
        if (input.cwd) base.cwd = input.cwd
        const environment = applySecretPatches(stringRecord(previous.environment), secrets?.environment, mode)
        if (Object.keys(environment).length) base.environment = environment
        return base
    }
    base.url = input.url
    const auth = input.auth
    if (auth === undefined || auth === "headers") {
        const headers = applySecretPatches(stringRecord(previous.headers), secrets?.headers, mode)
        if (Object.keys(headers).length) base.headers = headers
    }
    if (auth === undefined) {
        // Sem a escolha (chamadas antigas): a chave `oauth` do arquivo continua como estava.
        if (previous.oauth !== undefined) base.oauth = previous.oauth
    } else if (auth === "oauth") {
        base.oauth = oauthEntryOf(input.oauth, previous.oauth, secrets?.oauthClientSecret)
    } else if (input.disableAutoOauth ?? previous.oauth === false) {
        base.oauth = false
    }
    return base
}

/** Só segredos alterados (mantém o resto). */
export function withSecrets(existing: Json, secrets: Secrets): Json {
    const next: Json = { ...existing }
    if (secrets.environment) {
        const environment = applySecretPatches(stringRecord(existing.environment), secrets.environment, "merge")
        if (Object.keys(environment).length) next.environment = environment
        else delete next.environment
    }
    if (secrets.headers) {
        const headers = applySecretPatches(stringRecord(existing.headers), secrets.headers, "merge")
        if (Object.keys(headers).length) next.headers = headers
        else delete next.headers
    }
    if (secrets.oauthClientSecret !== undefined && existing.oauth && typeof existing.oauth === "object") {
        const oauth = { ...(existing.oauth as Json) }
        if (secrets.oauthClientSecret && oauth.client_id) oauth.client_secret = secrets.oauthClientSecret
        else delete oauth.client_secret
        next.oauth = oauth
    }
    return next
}

const textOrNull = (value: unknown) => (typeof value === "string" && value ? value : null)

function oauthDetailOf(value: unknown): McpDetailDto["oauth"] {
    if (value === false) return false
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    const oauth = value as Json
    return {
        clientId: textOrNull(oauth.client_id),
        scope: textOrNull(oauth.scope),
        callbackPort: typeof oauth.callback_port === "number" ? oauth.callback_port : null,
        redirectUri: textOrNull(oauth.redirect_uri),
        authServerMetadataUrl: textOrNull(oauth.auth_server_metadata_url),
        hasClientSecret: typeof oauth.client_secret === "string" && oauth.client_secret.length > 0,
    }
}

export function mcpDetailOf(entry: Json): McpDetailDto {
    const type = entry.type === "remote" ? "remote" : "local"
    const timeout = entry.timeout && typeof entry.timeout === "object" ? (entry.timeout as McpDetailDto["timeout"]) : null
    return {
        type,
        command: Array.isArray(entry.command) ? entry.command.filter((item): item is string => typeof item === "string") : null,
        url: typeof entry.url === "string" ? entry.url : null,
        cwd: typeof entry.cwd === "string" ? entry.cwd : null,
        disabled: entry.disabled === true,
        timeout,
        environmentKeys: Object.keys(stringRecord(entry.environment)),
        headerKeys: Object.keys(stringRecord(entry.headers)),
        ...mcpAuthOf(type, entry),
    }
}

function mcpAuthOf(type: "local" | "remote", entry: Json): Pick<McpDetailDto, "auth" | "oauth"> {
    const oauth = type === "remote" ? oauthDetailOf(entry.oauth) : null
    if (type === "local") return { auth: "none", oauth: null }
    if (oauth) return { auth: "oauth", oauth }
    return { auth: Object.keys(stringRecord(entry.headers)).length ? "headers" : "none", oauth }
}

/** MCP remoto que usa OAuth (o inspector não tem o token: o teste usa a situação do OpenCode). */
export const usesOauth = (entry: Json) => entry.type === "remote" && Boolean(entry.oauth) && typeof entry.oauth === "object"

/** Configuração no formato do inspector (`mcpServers`) para listar as ferramentas. */
export function inspectorConfig(name: string, entry: Json): Json {
    if (entry.type === "remote") return { mcpServers: { [name]: { type: "streamable-http", url: entry.url, headers: stringRecord(entry.headers) } } }
    const command = Array.isArray(entry.command) ? entry.command.map(String) : []
    return { mcpServers: { [name]: { command: command[0] ?? "", args: command.slice(1), env: stringRecord(entry.environment), ...(typeof entry.cwd === "string" ? { cwd: entry.cwd } : {}) } } }
}
