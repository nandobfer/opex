import { ENV_FILE } from "./constants"
import { round2, type ResourceLimits } from "./resource-limits"

/** Onde o compose declara o limite: no serviço (`mem_limit`/`cpus`) ou em `deploy.resources.limits`. */
export type LimitStyle = "service" | "deploy"

/** O que o deploy precisa saber do `docker compose config --format json` (puro). */
export interface ComposeService {
    name: string
    hasBuild: boolean
    /** Volumes que montam arquivos da máquina (não funcionam em outra máquina). */
    bindMounts: string[]
    hasWatch: boolean
    /** Limites declarados no próprio compose (sem o override do app). */
    declared: ResourceLimits
    /** Forma usada pelo compose (o override segue a mesma, para não declarar as duas com valores diferentes). */
    limitStyle: { memory: LimitStyle; cpus: LimitStyle }
}

interface RawService {
    build?: unknown
    volumes?: { type?: string; source?: string; target?: string }[]
    develop?: { watch?: unknown[] }
    mem_limit?: unknown
    memswap_limit?: unknown
    cpus?: unknown
    deploy?: { resources?: { limits?: { memory?: unknown; cpus?: unknown } } }
}

const UNITS: Record<string, number> = { "": 1, b: 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3, t: 1024 ** 4 }

/** Bytes de um valor do compose (`1073741824`, `"512m"`, `"1g"`, `"1.5gb"`); `null` = ausente ou não literal (ex.: `${VAR}`). */
export function composeBytes(value: unknown): number | null {
    if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null
    if (typeof value !== "string") return null
    const match = /^(\d+(?:\.\d+)?)\s*([bkmgt]?)b?$/i.exec(value.trim())
    if (!match) return null
    const bytes = Number(match[1]) * UNITS[match[2]!.toLowerCase()]!
    return bytes > 0 ? bytes : null
}

const composeCpus = (value: unknown): number | null => {
    const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim()) ? Number(value) : Number.NaN
    return Number.isFinite(parsed) && parsed > 0 ? round2(parsed) : null
}

const GIB = 1024 ** 3

function declaredLimits(service: RawService): Pick<ComposeService, "declared" | "limitStyle"> {
    const limits = service.deploy?.resources?.limits
    const serviceMemory = composeBytes(service.mem_limit)
    const memory = serviceMemory ?? composeBytes(limits?.memory)
    const serviceCpus = composeCpus(service.cpus)
    const swapTotal = composeBytes(service.memswap_limit)
    const memoryGb = memory === null ? null : round2(memory / GIB)
    const swapGb = memory !== null && swapTotal !== null && swapTotal >= memory ? round2((swapTotal - memory) / GIB) : null
    return {
        declared: { memoryGb, swapGb, cpus: serviceCpus ?? composeCpus(limits?.cpus) },
        limitStyle: { memory: service.mem_limit !== undefined ? "service" : "deploy", cpus: service.cpus !== undefined ? "service" : "deploy" },
    }
}

/** Lê a saída do `config --format json` (pode ter avisos antes do JSON). */
export function parseComposeConfig(output: string): ComposeService[] | null {
    const start = output.indexOf("{")
    if (start < 0) return null
    let parsed: { services?: Record<string, RawService> }
    try {
        parsed = JSON.parse(output.slice(start)) as { services?: Record<string, RawService> }
    } catch {
        return null
    }
    if (!parsed.services || typeof parsed.services !== "object") return null
    return Object.entries(parsed.services).map(([name, service]) => ({
        name,
        hasBuild: Boolean(service.build),
        bindMounts: (service.volumes ?? []).filter((volume) => volume.type === "bind").map((volume) => `${volume.source ?? "?"}:${volume.target ?? "?"}`),
        hasWatch: Array.isArray(service.develop?.watch) && service.develop.watch.length > 0,
        ...declaredLimits(service),
    }))
}

/** Serviços do ambiente (os escolhidos; vazio = todos). */
export function selectServices(services: ComposeService[], chosen: string[]): ComposeService[] {
    return chosen.length ? services.filter((service) => chosen.includes(service.name)) : services
}

/** Executar no PC: bind mount e `develop.watch` não funcionam (o código fica no servidor). `null` = ok. */
export function runOnPcProblem(services: ComposeService[]): string | null {
    const binds = services.filter((service) => service.bindMounts.length).map((service) => `${service.name} (${service.bindMounts.join(", ")})`)
    const watch = services.filter((service) => service.hasWatch).map((service) => service.name)
    const parts: string[] = []
    if (binds.length) parts.push(`bind mount em ${binds.join("; ")}`)
    if (watch.length) parts.push(`develop.watch em ${watch.join(", ")}`)
    return parts.length ? `Não dá para executar no PC: ${parts.join(" e ")}. Esses recursos montam arquivos da máquina do build; tire-os do compose (ou use um override só para desenvolvimento) ou execute no servidor.` : null
}

const mib = (gb: number) => `${Math.round(gb * 1024)}m`

/**
 * Chaves dos limites de um serviço no override (só os preenchidos). RAM e CPUs seguem a forma do
 * compose (`mem_limit`/`cpus` ou `deploy.resources.limits`); o swap vai em `memswap_limit` (RAM + swap;
 * 0 = igual à RAM; vazio = sem a chave, padrão do Docker).
 */
export function limitLines(limits: ResourceLimits, style: ComposeService["limitStyle"]): string[] {
    const lines: string[] = []
    const deploy: string[] = []
    if (limits.memoryGb !== null) {
        if (style.memory === "service") lines.push(`    mem_limit: ${JSON.stringify(mib(limits.memoryGb))}`)
        else deploy.push(`          memory: ${JSON.stringify(mib(limits.memoryGb))}`)
        if (limits.swapGb !== null) lines.push(`    memswap_limit: ${JSON.stringify(mib(limits.memoryGb + limits.swapGb))}`)
    }
    if (limits.cpus !== null) {
        if (style.cpus === "service") lines.push(`    cpus: ${limits.cpus}`)
        else deploy.push(`          cpus: ${JSON.stringify(String(limits.cpus))}`)
    }
    if (deploy.length) lines.push("    deploy:", "      resources:", "        limits:", ...deploy)
    return lines
}

/** `docker-compose.opex.yml`: imagem do registry (build e execução em máquinas diferentes), as variáveis extras e os limites. */
export function overrideYaml(input: { services: ComposeService[]; images: Record<string, string>; withEnvFile: boolean; envFilePath?: string; limits?: Record<string, ResourceLimits | null> }): string {
    const blocks = input.services
        .map((service) => {
            const lines: string[] = []
            const image = input.images[service.name]
            if (image) lines.push(`    image: ${JSON.stringify(image)}`)
            if (input.withEnvFile) lines.push("    env_file:", `      - ${JSON.stringify(input.envFilePath ?? ENV_FILE)}`)
            const limits = input.limits?.[service.name]
            if (limits) lines.push(...limitLines(limits, service.limitStyle))
            return lines.length ? [`  ${JSON.stringify(service.name)}:`, ...lines].join("\n") : null
        })
        .filter((block): block is string => block !== null)
    return blocks.length ? `# Gerado pelo opex (Ambientes). Não edite: é regravado a cada deploy.\nservices:\n${blocks.join("\n")}\n` : "# Gerado pelo opex (Ambientes). Não edite: é regravado a cada deploy.\nservices: {}\n"
}
