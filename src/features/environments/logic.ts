import type { ComposeSummary, ComposeServiceSummary, RestoreCompatibility } from "./compose-types"

/**
 * Regras puras do módulo Ambientes: nomes de projeto/tag, normalização de versão de banco,
 * compatibilidade imagem ↔ banco e leitura do `docker-compose`. Sem I/O — coberto por testes.
 */

/** Slug usado em nomes do Docker (minúsculo, `a-z0-9-`). */
export function slugify(value: string, fallback = "x"): string {
    const slug = value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40)
    return slug || fallback
}

/** Nome do projeto Compose do ambiente: `<slug-repo>-<slug-ambiente>` (isola por ambiente). */
export function composeProjectName(repoSlug: string, envSlug: string): string {
    return `${slugify(repoSlug, "repo")}-${slugify(envSlug, "env")}`
}

/** Tag do Docker válida (`[a-z0-9_.-]`, até 128 caracteres). */
export function sanitizeDockerTag(value: string): string {
    const clean = value
        .toLowerCase()
        .replace(/[^a-z0-9_.-]+/g, "-")
        .replace(/^[-.]+|[-.]+$/g, "")
        .slice(0, 128)
    return clean || "latest"
}

/** `yyyymmddHHmmss` em UTC, para compor a tag da imagem. */
export function formatTagTimestamp(date: Date): string {
    const p = (n: number, size = 2) => String(n).padStart(size, "0")
    return (
        `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
        `${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}`
    )
}

/** Tag da imagem publicada pelo Opex: `<versão-banco>-<timestamp>`, sanitizada para o Docker. */
export function buildImageTag(dbVersion: string | null, builtAt: Date): string {
    return `${sanitizeDockerTag(dbVersion ?? "unknown")}-${formatTagTimestamp(builtAt)}`
}

/** Normaliza a versão de banco lida (string não vazia, limitada). `null` = desconhecida. */
export function normalizeDbVersion(value: unknown): string | null {
    if (typeof value === "number" && Number.isFinite(value)) return String(value)
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed ? trimmed.slice(0, 120) : null
}

export interface RestoreCompatibilityInput {
    /** Versão atual do banco (`null` = desconhecida). */
    currentVersion: string | null
    /** Versão de banco gravada na imagem (`null` = desconhecida). */
    imageVersion: string | null
    origin: "opex" | "cd" | "unknown"
    /** O usuário já confirmou restaurar mesmo assim. */
    confirmUnverified: boolean
}

/**
 * Decide se uma imagem pode ser restaurada:
 * - versão conhecida **diferente** → **bloqueada** (exige restaurar o banco para a versão da imagem);
 * - versão conhecida **igual** e origem Opex → **liberada**;
 * - versão **desconhecida** (banco ou imagem) ou imagem do **CD** → **confirmação** explícita.
 */
export function checkRestoreCompatibility(input: RestoreCompatibilityInput): RestoreCompatibility {
    const { currentVersion, imageVersion, origin, confirmUnverified } = input

    if (currentVersion && imageVersion && currentVersion !== imageVersion) {
        return {
            level: "blocked",
            allowed: false,
            requiresConfirmation: false,
            message: `A imagem usa a versão de banco ${imageVersion}, mas o banco atual está em ${currentVersion}. Restaure o banco para a versão da imagem antes de continuar.`,
        }
    }

    const knownEqual = currentVersion !== null && imageVersion !== null && currentVersion === imageVersion
    if (knownEqual && origin === "opex") {
        return { level: "compatible", allowed: true, requiresConfirmation: false, message: "Versão de banco compatível." }
    }

    const reason = knownEqual
        ? "A imagem foi publicada pelo CD"
        : imageVersion === null
          ? "A imagem não informa a versão de banco"
          : "A versão atual do banco é desconhecida"

    if (confirmUnverified) {
        return { level: "confirm", allowed: true, requiresConfirmation: true, message: `${reason}; restauração confirmada.` }
    }
    return { level: "confirm", allowed: false, requiresConfirmation: true, message: `${reason}. Confirme para restaurar.` }
}

// ---------------------------------------------------------------------------
// docker-compose
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
    if (typeof value === "string") return [value]
    return []
}

function environmentKeys(value: unknown): string[] {
    if (Array.isArray(value)) return value.map((item) => (typeof item === "string" ? item.split("=")[0] : String(item)))
    if (isRecord(value)) return Object.keys(value)
    return []
}

function buildRef(value: unknown): string | null {
    if (typeof value === "string") return value
    if (isRecord(value) && typeof value.context === "string") return value.context
    return null
}

/** Serviços declarados num compose já interpretado (objeto JS). */
export function summarizeCompose(doc: unknown, file = "docker-compose.yml"): ComposeSummary {
    if (!isRecord(doc)) return { file, services: [], volumes: [], networks: [] }
    const servicesRaw = isRecord(doc.services) ? doc.services : {}
    const services: ComposeServiceSummary[] = Object.entries(servicesRaw).map(([name, raw]) => {
        const service = isRecord(raw) ? raw : {}
        return {
            name,
            image: typeof service.image === "string" ? service.image : null,
            build: buildRef(service.build),
            ports: toStringArray(service.ports),
            volumes: toStringArray(service.volumes),
            environment: environmentKeys(service.environment),
            containerName: typeof service.container_name === "string" ? service.container_name : null,
            dependsOn: Array.isArray(service.depends_on) ? toStringArray(service.depends_on) : isRecord(service.depends_on) ? Object.keys(service.depends_on) : [],
        }
    })
    return {
        file,
        services,
        volumes: isRecord(doc.volumes) ? Object.keys(doc.volumes) : [],
        networks: isRecord(doc.networks) ? Object.keys(doc.networks) : [],
    }
}

/**
 * Configurações do compose que furam o isolamento por ambiente (projeto Compose distinto):
 * `container_name` fixo, volumes/redes `external: true`. Lista vazia = sem conflito conhecido.
 */
export function findComposeIsolationConflicts(doc: unknown): string[] {
    if (!isRecord(doc)) return []
    const conflicts: string[] = []
    const servicesRaw = isRecord(doc.services) ? doc.services : {}
    for (const [name, raw] of Object.entries(servicesRaw)) {
        if (isRecord(raw) && typeof raw.container_name === "string" && raw.container_name.trim()) {
            conflicts.push(`O serviço "${name}" usa container_name fixo ("${raw.container_name.trim()}"), que não é isolado por ambiente.`)
        }
    }
    for (const kind of ["volumes", "networks"] as const) {
        const section = isRecord(doc[kind]) ? (doc[kind] as Record<string, unknown>) : {}
        for (const [name, raw] of Object.entries(section)) {
            if (isRecord(raw) && raw.external === true) {
                conflicts.push(`O ${kind === "volumes" ? "volume" : "rede"} "${name}" é external; use um recurso próprio do ambiente.`)
            }
        }
    }
    return conflicts
}

/** Resume os conflitos num único texto (vazio quando não há). */
export function describeIsolationConflicts(conflicts: readonly string[]): string {
    return conflicts.join(" ")
}
