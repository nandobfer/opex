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

export interface ParsedProjectContainer {
    id: string
    name: string
    image: string | null
    state: string
    status: string
    /** Projeto Compose do container (`com.docker.compose.project`). */
    project: string | null
    /** Diretório de trabalho do projeto (`com.docker.compose.project.working_dir`). */
    workingDir: string | null
    /** Arquivos de configuração do projeto (`com.docker.compose.project.config_files`). */
    configFiles: string | null
    /** Serviço do Compose (`com.docker.compose.service`). */
    service: string | null
}

/** Separador (TAB) do formato de `docker ps` do módulo (evita colisão com o conteúdo). */
export const DOCKER_PS_SEPARATOR = "\t"

/**
 * Campos do `docker ps --format` que expõem a identidade do projeto Compose. Inclui as labels que
 * permitem **descobrir e adotar** um projeto já em execução fora do Opex.
 */
export const DOCKER_PS_FORMAT = [
    "{{.ID}}",
    "{{.Names}}",
    "{{.Image}}",
    "{{.State}}",
    "{{.Status}}",
    '{{.Label "com.docker.compose.project"}}',
    '{{.Label "com.docker.compose.project.working_dir"}}',
    '{{.Label "com.docker.compose.project.config_files"}}',
    '{{.Label "com.docker.compose.service"}}',
].join(DOCKER_PS_SEPARATOR)

/** Linhas de `docker ps -a --format <DOCKER_PS_FORMAT>` (uma por container, campos por TAB). */
export function parseDockerPsLabels(text: string): ParsedProjectContainer[] {
    const out: ParsedProjectContainer[] = []
    for (const line of text.split("\n")) {
        if (!line.trim()) continue
        const [id, name, image, state, status, project, workingDir, configFiles, service] = line.split(DOCKER_PS_SEPARATOR)
        if (!id?.trim() || !name?.trim()) continue
        const clean = (value: string | undefined) => {
            const trimmed = (value ?? "").trim()
            return trimmed.length > 0 ? trimmed : null
        }
        out.push({
            id: id.trim(),
            name: name.trim(),
            image: clean(image),
            state: clean(state) ?? "unknown",
            status: clean(status) ?? "",
            project: clean(project),
            workingDir: clean(workingDir),
            configFiles: clean(configFiles),
            service: clean(service),
        })
    }
    return out
}

/** Agrupa os containers por projeto Compose, resumindo diretório, arquivos e serviços. */
export function groupComposeProjects(containers: readonly ParsedProjectContainer[]): {
    project: string
    workingDir: string | null
    configFiles: string[]
    services: string[]
    running: boolean
}[] {
    const byProject = new Map<string, { project: string; workingDir: string | null; configFiles: Set<string>; services: Set<string>; running: boolean }>()
    for (const container of containers) {
        if (!container.project) continue
        const entry = byProject.get(container.project) ?? { project: container.project, workingDir: container.workingDir, configFiles: new Set<string>(), services: new Set<string>(), running: false }
        if (!entry.workingDir && container.workingDir) entry.workingDir = container.workingDir
        for (const file of (container.configFiles ?? "").split(",").map((item) => item.trim()).filter(Boolean)) entry.configFiles.add(file)
        if (container.service) entry.services.add(container.service)
        if (/^running$/i.test(container.state)) entry.running = true
        byProject.set(container.project, entry)
    }
    return [...byProject.values()].map((entry) => ({
        project: entry.project,
        workingDir: entry.workingDir,
        configFiles: [...entry.configFiles],
        services: [...entry.services],
        running: entry.running,
    }))
}

/**
 * Linhas de `docker logs --timestamps`: remove o prefixo RFC3339 e devolve `{ ts, text }`. Linhas sem
 * timestamp (continuação de stack trace) herdam `ts` nulo.
 */
export function parseDockerLogLines(text: string): { ts: string | null; text: string }[] {
    const out: { ts: string | null; text: string }[] = []
    for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
        if (!raw) continue
        const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s?(.*)$/.exec(raw)
        if (match) out.push({ ts: match[1]!, text: match[2] ?? "" })
        else out.push({ ts: null, text: raw })
    }
    return out
}
