import type { McpConfigInput, SecretPatch } from "./schemas"
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

const OWN_KEYS = new Set(["type", "command", "url", "cwd", "environment", "headers", "timeout", "disabled", "enabled"])

/** Monta a entrada do MCP preservando chaves extras do OpenCode (`codemode`, `protocol`, `oauth`...). */
export function buildMcpEntry(input: McpConfigInput, existing: Json | undefined, secrets: { environment?: readonly SecretPatch[]; headers?: readonly SecretPatch[] } | undefined, mode: "replace" | "merge"): Json {
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
    } else {
        base.url = input.url
        const headers = applySecretPatches(stringRecord(previous.headers), secrets?.headers, mode)
        if (Object.keys(headers).length) base.headers = headers
    }
    return base
}

/** Só segredos alterados (mantém o resto). */
export function withSecrets(existing: Json, secrets: { environment?: readonly SecretPatch[]; headers?: readonly SecretPatch[] }): Json {
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
    return next
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
    }
}

/** Configuração no formato do inspector (`mcpServers`) para listar as ferramentas. */
export function inspectorConfig(name: string, entry: Json): Json {
    if (entry.type === "remote") return { mcpServers: { [name]: { type: "streamable-http", url: entry.url, headers: stringRecord(entry.headers) } } }
    const command = Array.isArray(entry.command) ? entry.command.map(String) : []
    return { mcpServers: { [name]: { command: command[0] ?? "", args: command.slice(1), env: stringRecord(entry.environment), ...(typeof entry.cwd === "string" ? { cwd: entry.cwd } : {}) } } }
}
