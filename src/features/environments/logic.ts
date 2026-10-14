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
    /**
     * Schema **registrado no Opex** como aplicado ao ambiente (`null` = desconhecido). Não é uma
     * leitura do banco real: é o histórico de publicações bem-sucedidas registradas pelo Opex.
     */
    appliedVersion: string | null
    /** Schema esperado pela imagem (`null` = desconhecida). */
    imageVersion: string | null
    origin: "opex" | "cd" | "unknown"
    /** O usuário já confirmou restaurar mesmo assim. */
    confirmUnverified: boolean
}

/**
 * Decide se uma imagem pode ser restaurada, comparando o **schema registrado no Opex** para o
 * ambiente com o schema esperado pela imagem:
 * - schema conhecido **diferente** → **bloqueada** (exige publicar a versão do banco antes);
 * - schema conhecido **igual** e origem Opex → **liberada**;
 * - schema **desconhecido** (ambiente ou imagem) ou imagem do **CD** → **confirmação** explícita.
 */
export function checkRestoreCompatibility(input: RestoreCompatibilityInput): RestoreCompatibility {
    const { appliedVersion, imageVersion, origin, confirmUnverified } = input

    if (appliedVersion && imageVersion && appliedVersion !== imageVersion) {
        return {
            level: "blocked",
            allowed: false,
            requiresConfirmation: false,
            message: `A imagem usa o schema ${imageVersion}, mas o ambiente está registrado no ${appliedVersion}. Publique a versão do banco antes de restaurar.`,
        }
    }

    const knownEqual = appliedVersion !== null && imageVersion !== null && appliedVersion === imageVersion
    if (knownEqual && origin === "opex") {
        return { level: "compatible", allowed: true, requiresConfirmation: false, message: "Versão de banco compatível." }
    }

    const reason = knownEqual
        ? "A imagem foi publicada pelo CD"
        : imageVersion === null
          ? "A imagem não informa o schema do banco"
          : "O schema aplicado ao ambiente é desconhecido"

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

// ---------------------------------------------------------------------------
// Arquivo .env do host
// ---------------------------------------------------------------------------

/**
 * Chaves cujo valor é tratado como segredo por padrão: nunca sai do servidor e só o dono pode
 * definir/substituir. Qualquer chave desconhecida que casa com o padrão é protegida.
 */
const SECRET_ENV_KEY = /(PASS(WORD|WD)?|SECRET|TOKEN|CREDENTIAL|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY|AUTH|DSN|CONN(ECTION)?_?STRING|SESSION_?KEY|ENCRYPTION_?KEY)/i

/** A chave do `.env` é sensível (valor nunca devolvido ao navegador)? */
export function isSecretEnvKey(key: string): boolean {
    return SECRET_ENV_KEY.test(key)
}

/** Chave de variável de ambiente válida (`POSIX`). */
export const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

export interface EnvAssignment {
    key: string
    /** Valor sem as aspas externas. */
    value: string
    /** Índice (0-based) da primeira linha da atribuição. */
    start: number
    /** Índice da última linha (multilinha ocupa várias). */
    end: number
}

export interface ParsedEnvFile {
    /** Linhas originais, preservando comentários, espaços e linhas desconhecidas. */
    lines: string[]
    assignments: EnvAssignment[]
}

const ASSIGNMENT = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]*)$/

function unquote(raw: string): { value: string; quote: "\"" | "'" | null; closed: boolean } {
    const trimmed = raw.trim()
    const first = trimmed[0]
    if (first === "\"" || first === "'") {
        let closed = false
        let value = ""
        for (let i = 1; i < trimmed.length; i++) {
            const char = trimmed[i]
            if (char === "\\" && first === "\"" && i + 1 < trimmed.length) {
                const next = trimmed[i + 1]!
                value += next === "n" ? "\n" : next === "t" ? "\t" : next
                i++
                continue
            }
            if (char === first) {
                closed = true
                break
            }
            value += char
        }
        return { value, quote: first, closed }
    }
    return { value: trimmed, quote: null, closed: true }
}

/** Interpreta o conteúdo de um `.env` preservando comentários e linhas não editadas. */
export function parseEnvFile(content: string): ParsedEnvFile {
    const lines = content.length === 0 ? [] : content.replace(/\r\n/g, "\n").split("\n")
    const assignments: EnvAssignment[] = []
    for (let index = 0; index < lines.length; index++) {
        const match = ASSIGNMENT.exec(lines[index] ?? "")
        if (!match) continue
        const key = match[1]!
        const rest = match[2] ?? ""
        const { value, quote, closed } = unquote(rest)
        let end = index
        let resolved = value
        // Valor multilinha (aspas abertas): consome as linhas seguintes até fechar.
        if (!closed && quote) {
            const parts = [value]
            while (end + 1 < lines.length) {
                end++
                const next = lines[end] ?? ""
                const closing = next.indexOf(quote)
                if (closing >= 0) {
                    parts.push(next.slice(0, closing))
                    break
                }
                parts.push(next)
            }
            resolved = parts.join("\n")
        }
        assignments.push({ key, value: resolved, start: index, end })
        index = end
    }
    return { lines, assignments }
}

function renderValue(value: string): string {
    if (value === "") return ""
    if (/[\s#'"$\\]/.test(value)) {
        return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`
    }
    return value
}

export interface EnvChange {
    key: string
    /** `null` remove a chave; string (mesmo vazia) define o valor. */
    value: string | null
}

/**
 * Aplica alterações por chave **sem reconstruir** o arquivo: as linhas não alteradas (comentários,
 * espaços, valores secretos preservados) permanecem; chaves novas entram no fim.
 */
export function applyEnvChanges(parsed: ParsedEnvFile, changes: readonly EnvChange[]): string {
    const byKey = new Map(parsed.assignments.map((assignment) => [assignment.key, assignment]))
    const lines = [...parsed.lines]
    const removed = new Set<number>()
    const appended: string[] = []
    for (const change of changes) {
        const assignment = byKey.get(change.key)
        if (!assignment) {
            if (change.value !== null) appended.push(`${change.key}=${renderValue(change.value)}`)
            continue
        }
        if (change.value === null) {
            for (let i = assignment.start; i <= assignment.end; i++) removed.add(i)
            continue
        }
        for (let i = assignment.start + 1; i <= assignment.end; i++) removed.add(i)
        lines[assignment.start] = `${change.key}=${renderValue(change.value)}`
    }
    const kept = lines.filter((_, index) => !removed.has(index))
    if (appended.length > 0) {
        if (kept.length > 0 && kept[kept.length - 1]!.trim() !== "") kept.push("")
        kept.push(...appended)
    }
    return `${kept.join("\n").replace(/\n+$/, "")}\n`
}

// ---------------------------------------------------------------------------
// Projeto Compose existente (adoção)
// ---------------------------------------------------------------------------

/** Normaliza um diretório para comparação (sem barra final, `~` resolvido por quem chama). */
export function normalizeDirectory(value: string): string {
    return value.trim().replace(/\/+$/, "")
}

export interface ComposeProjectCandidate {
    project: string
    workingDir: string | null
    configFiles: string[]
    services: string[]
    running: boolean
}

/**
 * Escolhe o projeto Compose **existente** que corresponde ao ambiente: o diretório de trabalho bate
 * e o arquivo do compose está entre os arquivos de configuração. Um candidato → adotado; vários →
 * `ambiguous` (o usuário escolhe); nenhum → `null` (publicação nova usa o projeto isolado do Opex).
 */
export function pickComposeProject(
    candidates: readonly ComposeProjectCandidate[],
    input: { directory: string; composeFile: string },
): { project: ComposeProjectCandidate | null; ambiguous: boolean } {
    const directory = normalizeDirectory(input.directory)
    const file = input.composeFile.trim().replace(/^\.\//, "")
    const matches = candidates.filter((candidate) => {
        if (directory && normalizeDirectory(candidate.workingDir ?? "") !== directory) return false
        if (!file) return true
        return candidate.configFiles.some((config) => config.replace(/^\.\//, "").endsWith(file))
    })
    if (matches.length === 0) return { project: null, ambiguous: false }
    if (matches.length === 1) return { project: matches[0]!, ambiguous: false }
    return { project: null, ambiguous: true }
}

export interface EnvRow {
    key: string
    value: string
    secret: boolean
}

/**
 * Diferença entre as linhas editadas e o arquivo do host: só o que mudou é enviado. O valor de uma
 * variável sensível nunca é conhecido no cliente, então ele só entra quando o usuário digita um
 * substituto (mesmo vazio, a chave é preservada). Chaves ausentes na edição são removidas.
 */
export function diffEnvRows(original: readonly EnvRow[], rows: readonly EnvRow[]): EnvChange[] {
    const changes: EnvChange[] = []
    const remaining = new Map(original.map((row) => [row.key, row]))
    for (const row of rows) {
        const key = row.key.trim()
        if (!key) continue
        const before = remaining.get(key)
        remaining.delete(key)
        if (!before) {
            if (row.value !== "") changes.push({ key, value: row.value })
            continue
        }
        if (row.secret) {
            if (row.value !== "") changes.push({ key, value: row.value })
            continue
        }
        if (row.value !== before.value) changes.push({ key, value: row.value })
    }
    for (const key of remaining.keys()) changes.push({ key, value: null })
    return changes
}
