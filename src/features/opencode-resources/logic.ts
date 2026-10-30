import type { OpencodeResourceDto } from "./types"

/** Regras puras da tela de recursos (filtro, contagens, comando do MCP). */

export const RESOURCE_STATUS_FILTERS = ["all", "enabled", "disabled", "outdated"] as const
export type ResourceStatusFilter = (typeof RESOURCE_STATUS_FILTERS)[number]

export const RESOURCE_STATUS_FILTER_LABELS: Record<ResourceStatusFilter, string> = {
    all: "Todos",
    enabled: "Ligados",
    disabled: "Desligados",
    outdated: "Com atualização",
}

export function matchesStatus(item: OpencodeResourceDto, status: ResourceStatusFilter): boolean {
    if (status === "enabled") return item.enabled
    if (status === "disabled") return !item.enabled
    if (status === "outdated") return item.version?.outdated === true
    return true
}

export const outdatedCount = (items: readonly OpencodeResourceDto[]) => items.filter((item) => item.enabled && item.version?.outdated).length

/**
 * Divide a linha de comando em partes, como um shell simples: aspas simples são literais; dentro de
 * aspas duplas (e fora de aspas) `\` escapa o caractere seguinte (`\"`, `\\`, espaço). É a inversa
 * exata de `joinCommand`.
 */
export function splitCommand(line: string): string[] {
    const parts: string[] = []
    let current = ""
    let quote: '"' | "'" | null = null
    let started = false
    const chars = [...line.trim()]
    for (let index = 0; index < chars.length; index++) {
        const char = chars[index]!
        if (quote === "'") {
            if (char === "'") quote = null
            else current += char
            continue
        }
        if (char === "\\" && index + 1 < chars.length) {
            const next = chars[index + 1]!
            // Dentro de aspas duplas só `\"` e `\\` são escapes; o resto mantém a barra.
            if (quote === '"' && next !== '"' && next !== "\\") current += char
            else {
                current += next
                index++
            }
            started = true
            continue
        }
        if (quote === '"') {
            if (char === '"') quote = null
            else current += char
            continue
        }
        if (char === '"' || char === "'") {
            quote = char
            started = true
        } else if (/\s/.test(char)) {
            if (started) parts.push(current)
            current = ""
            started = false
        } else {
            current += char
            started = true
        }
    }
    if (started) parts.push(current)
    return parts
}

/** Junta as partes para exibir: entre aspas duplas quando preciso, escapando só `"` e `\`. */
export const joinCommand = (parts: readonly string[]) => parts.map((part) => (/[\s"'\\]/.test(part) || !part ? `"${part.replace(/["\\]/g, "\\$&")}"` : part)).join(" ")
