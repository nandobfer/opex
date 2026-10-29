import { ENV_FILE } from "./constants"

/** O que o deploy precisa saber do `docker compose config --format json` (puro). */
export interface ComposeService {
    name: string
    hasBuild: boolean
    /** Volumes que montam arquivos da máquina (não funcionam em outra máquina). */
    bindMounts: string[]
    hasWatch: boolean
}

interface RawService {
    build?: unknown
    volumes?: { type?: string; source?: string; target?: string }[]
    develop?: { watch?: unknown[] }
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

/** `docker-compose.opex.yml`: imagem do registry (build e execução em máquinas diferentes) e as variáveis extras. */
export function overrideYaml(input: { services: ComposeService[]; images: Record<string, string>; withEnvFile: boolean; envFilePath?: string }): string {
    const blocks = input.services
        .map((service) => {
            const lines: string[] = []
            const image = input.images[service.name]
            if (image) lines.push(`    image: ${JSON.stringify(image)}`)
            if (input.withEnvFile) lines.push("    env_file:", `      - ${JSON.stringify(input.envFilePath ?? ENV_FILE)}`)
            return lines.length ? [`  ${JSON.stringify(service.name)}:`, ...lines].join("\n") : null
        })
        .filter((block): block is string => block !== null)
    return blocks.length ? `# Gerado pelo opex (Ambientes). Não edite: é regravado a cada deploy.\nservices:\n${blocks.join("\n")}\n` : "# Gerado pelo opex (Ambientes). Não edite: é regravado a cada deploy.\nservices: {}\n"
}
