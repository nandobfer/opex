import { normalizeDbVersion } from "./logic"

/**
 * Parsers PUROS de saída do Docker/CLI. Recebem o texto bruto e devolvem estruturas tipadas —
 * separados do host para serem testáveis sem Docker.
 */

export interface ParsedImage {
    id: string
    repository: string
    tag: string | null
    createdAt: string | null
    size: string | null
}

function parseJsonLines(text: string): Record<string, unknown>[] {
    const trimmed = text.trim()
    if (!trimmed) return []
    // `docker compose ps --format json` pode devolver um array JSON ou um objeto por linha.
    if (trimmed.startsWith("[")) {
        try {
            const parsed = JSON.parse(trimmed)
            return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === "object") : []
        } catch {
            return []
        }
    }
    const out: Record<string, unknown>[] = []
    for (const line of trimmed.split("\n")) {
        const value = line.trim()
        if (!value.startsWith("{")) continue
        try {
            const parsed = JSON.parse(value)
            if (parsed && typeof parsed === "object") out.push(parsed as Record<string, unknown>)
        } catch {
            // linha parcial: ignora
        }
    }
    return out
}

function pick(row: Record<string, unknown>, keys: readonly string[]): string | null {
    for (const key of keys) {
        const value = row[key]
        if (typeof value === "string" && value.trim()) return value.trim()
    }
    return null
}

/** Linhas de `docker images --format '{{json .}}'` (ID, Repository, Tag, CreatedAt, Size). */
export function parseDockerImagesOutput(text: string): ParsedImage[] {
    return parseJsonLines(text)
        .map((row) => {
            const id = pick(row, ["ID", "Id", "id"])
            const repository = pick(row, ["Repository", "repository"]) ?? "<none>"
            const tag = pick(row, ["Tag", "tag"])
            return {
                id: id ?? "",
                repository,
                tag: tag && tag !== "<none>" ? tag : null,
                createdAt: pick(row, ["CreatedAt", "CreatedSince", "createdAt"]),
                size: pick(row, ["Size", "size"]),
            }
        })
        .filter((image) => Boolean(image.id))
}

export interface ParsedContainer {
    name: string
    service: string | null
    state: string
    status: string
    image: string | null
    health: string | null
}

/** Linhas de `docker compose ps --format json` (Name, Service, State, Status, Image, Health). */
export function parseComposePsOutput(text: string): ParsedContainer[] {
    return parseJsonLines(text)
        .map((row) => ({
            name: pick(row, ["Name", "name"]) ?? "",
            service: pick(row, ["Service", "service"]),
            state: pick(row, ["State", "state"]) ?? "unknown",
            status: pick(row, ["Status", "status"]) ?? "",
            image: pick(row, ["Image", "image"]),
            health: pick(row, ["Health", "health"]),
        }))
        .filter((container) => Boolean(container.name))
}

/**
 * Extrai a versão de banco de um texto: aceita JSON (`{ "version": "…" }`) ou o primeiro valor
 * não vazio. `null` quando nada legível.
 */
export function parseDbVersionText(text: string): string | null {
    const trimmed = text.trim()
    if (!trimmed) return null
    if (trimmed.startsWith("{")) {
        try {
            const parsed = JSON.parse(trimmed) as Record<string, unknown>
            const version = normalizeDbVersion(parsed.version ?? parsed.dbVersion ?? parsed.schemaVersion)
            if (version) return version
        } catch {
            // não é JSON: cai no texto simples
        }
    }
    const firstLine = trimmed.split("\n").find((line) => line.trim())?.trim() ?? ""
    return normalizeDbVersion(firstLine)
}
