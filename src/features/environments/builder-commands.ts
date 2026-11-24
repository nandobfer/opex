import { builderDriverOpts, quote } from "@/features/local-docker/commands"
import type { EnvironmentsBuilder } from "./schemas"
import type { BuilderLimitsDto } from "./types"

/**
 * Comandos (puros) do builder do buildx do **servidor** (linha "Builder do servidor" em Ambientes).
 * Rodam no host do OpenCode, no contexto atual do Docker (sem endpoint). O nome vem do schema validado.
 * Os limites vão por `--driver-opt` (gravados no buildx, valem em toda recriação) e a recriação usa
 * `--keep-state` (o volume de estado, isto é, o cache, é mantido).
 */

export const NETWORK_HOST_FLAG = "--allow-insecure-entitlement=network.host"
/** Flags do BuildKit que o Opex sabe recriar. */
const KNOWN_FLAGS = new Set([NETWORK_HOST_FLAG])

export const builderContainer = (name: string) => `buildx_buildkit_${name}0`

const GIB = 1024 ** 3
const round2 = (value: number) => Math.round(value * 100) / 100

export function builderCreateCommand(config: EnvironmentsBuilder): string {
    const opts = builderDriverOpts({ memoryGb: config.memoryGb, cpus: config.cpus, swapGb: config.swapGb })
        .map((opt) => `--driver-opt ${opt}`)
        .join(" ")
    const flags = config.allowNetworkHost ? ` --buildkitd-flags '${NETWORK_HOST_FLAG}'` : ""
    return `docker buildx create --name ${config.name} --driver docker-container ${opts}${flags}${config.useAsDefault ? " --use" : ""} >/dev/null`
}

const bootstrap = (name: string) => `docker buildx inspect --bootstrap ${name} >/dev/null`
const asHostDefault = (config: EnvironmentsBuilder) => (config.useAsDefault ? ` && docker buildx use ${config.name}` : "")

/** Cria só quando não existe; depois levanta (e marca como builder do host, quando configurado). */
export function builderEnsureCommand(config: EnvironmentsBuilder): string {
    return `{ docker buildx inspect ${config.name} >/dev/null 2>&1 || ${builderCreateCommand(config)}; } && ${bootstrap(config.name)}${asHostDefault(config)}`
}

/** Recria com os limites salvos mantendo o estado (`--keep-state`: o cache continua). */
export function builderRecreateCommand(config: EnvironmentsBuilder): string {
    return `{ docker buildx rm --keep-state ${config.name} >/dev/null 2>&1 || true; } && ${builderCreateCommand(config)} && ${bootstrap(config.name)}${asHostDefault(config)}`
}

export const builderStartCommand = (config: EnvironmentsBuilder) => `${bootstrap(config.name)}${asHostDefault(config)}`
export const builderStopCommand = (config: EnvironmentsBuilder) => `docker buildx stop ${config.name}`
/** Apaga o builder e o volume de estado dele (todo o cache do BuildKit). */
export const builderDeleteCommand = (config: EnvironmentsBuilder) => `docker buildx rm ${config.name}`
export const builderUseCommand = (config: EnvironmentsBuilder) => `docker buildx use ${config.name}`

/**
 * Antes do build de um deploy no servidor: cria o builder configurado quando ele não existe (com os
 * limites salvos; o cache volta se o volume de estado ainda existir) e avisa na saída do passo.
 */
export function builderDeployEnsureCommand(config: EnvironmentsBuilder): string {
    return `{ docker buildx inspect ${config.name} >/dev/null 2>&1 || { echo ${quote(`Builder ${config.name} não existia: criando com os limites salvos.`)}; ${builderCreateCommand(config)}; }; }`
}

/**
 * Aplica os limites ao vivo no container (`docker update`, ponte enquanto um build roda). Tirar um limite
 * não dá por aqui (fica para a recriação). A CPU segue o modo já aplicado: `--cpus` (NanoCpus) e quota
 * não convivem no mesmo container. `null` = nada a aplicar.
 */
export function builderUpdateCommand(config: EnvironmentsBuilder, cpuMode: "nano" | "quota"): string | null {
    const args: string[] = []
    if (config.memoryGb) {
        const memory = Math.round(config.memoryGb * 1024)
        const swap = config.swapGb === null ? memory * 2 : Math.round((config.memoryGb + config.swapGb) * 1024)
        args.push(`--memory ${memory}m`, `--memory-swap ${swap}m`)
    }
    if (config.cpus) args.push(cpuMode === "nano" ? `--cpus ${config.cpus}` : `--cpu-period 100000 --cpu-quota ${Math.round(config.cpus * 100_000)}`)
    return args.length ? `docker update ${args.join(" ")} ${builderContainer(config.name)} >/dev/null` : null
}

const MARK = "@@opex-builder "

/**
 * Estado do builder num comando só (blocos marcados): o `inspect` do builder (sem nome = o atual do
 * host), o builder atual, o container (estado e limites), o uso (CPU/RAM) e o host (CPUs e memória).
 */
export function builderStatusCommand(name: string | null): string {
    const pick = name ? `n=${quote(name)}` : `n=$(docker buildx inspect 2>/dev/null | awk '/^Name:/{print $2; exit}')`
    const container = `"buildx_buildkit_\${n}0"`
    return [
        pick,
        `printf '${MARK}name %s\\n' "$n"`,
        `printf '${MARK}inspect\\n'`,
        `if [ -n "$n" ]; then docker buildx inspect "$n" 2>&1; printf '\\n${MARK}inspect-exit %s\\n' "$?"; else printf '\\n${MARK}inspect-exit 1\\n'; fi`,
        `printf '${MARK}current\\n'`,
        `docker buildx inspect 2>/dev/null | awk '/^Name:/{print $2; exit}'`,
        `printf '${MARK}container\\n'`,
        `[ -n "$n" ] && docker inspect -f '{{.State.Status}}|{{.HostConfig.Memory}}|{{.HostConfig.MemorySwap}}|{{.HostConfig.NanoCpus}}|{{.HostConfig.CpuPeriod}}|{{.HostConfig.CpuQuota}}' ${container} 2>/dev/null`,
        `printf '${MARK}stats\\n'`,
        `[ -n "$n" ] && [ "$(docker inspect -f '{{.State.Running}}' ${container} 2>/dev/null)" = true ] && docker stats --no-stream --format '{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}' ${container} 2>/dev/null`,
        `printf '${MARK}host\\n'`,
        `docker info --format '{{.NCPU}}|{{.MemTotal}}' 2>/dev/null`,
        "true",
    ].join("; ")
}

export interface BuilderContainerState {
    state: string
    memoryBytes: number
    memorySwapBytes: number
    nanoCpus: number
    cpuPeriod: number
    cpuQuota: number
}

export interface ParsedBuilderStatus {
    name: string | null
    exists: boolean
    driver: string | null
    /** Status do nó no `inspect` (running, stopped, inactive…). */
    nodeStatus: string | null
    driverOpts: Record<string, string>
    flags: string[]
    current: string | null
    container: BuilderContainerState | null
    usage: { cpuPercent: number; memoryUsage: string; memoryPercent: number } | null
    host: { cpus: number; memoryGb: number } | null
}

function blocks(output: string): Map<string, string[]> {
    const result = new Map<string, string[]>()
    let current: string | null = null
    for (const raw of output.replace(/\r/g, "").split("\n")) {
        if (raw.startsWith(MARK)) {
            const [key = "", ...rest] = raw.slice(MARK.length).split(" ")
            if (key === "name" || key === "inspect-exit") {
                result.set(key, [rest.join(" ").trim()])
                continue
            }
            current = key
            result.set(key, [])
            continue
        }
        if (current) result.get(current)!.push(raw)
    }
    return result
}

const field = (lines: string[], label: string) => {
    const line = lines.find((item) => item.startsWith(`${label}:`))
    return line ? line.slice(label.length + 1).trim() : null
}

const number = (value: string | undefined) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

const percent = (value: string | undefined) => {
    const parsed = Number.parseFloat((value ?? "").replace("%", ""))
    return Number.isFinite(parsed) ? parsed : 0
}

/** Lê a saída de `builderStatusCommand` (puro). */
export function parseBuilderStatus(output: string): ParsedBuilderStatus {
    const parts = blocks(output)
    const name = parts.get("name")?.[0] || null
    const inspect = parts.get("inspect") ?? []
    const exists = Boolean(name) && parts.get("inspect-exit")?.[0] === "0"
    const driverOpts: Record<string, string> = {}
    const opts = exists ? field(inspect, "Driver Options") : null
    for (const match of (opts ?? "").matchAll(/([\w.-]+)="([^"]*)"/g)) driverOpts[match[1]!] = match[2]!
    const flagsLine = exists ? field(inspect, "BuildKit daemon flags") : null
    const containerLine = (parts.get("container") ?? []).find((line) => line.includes("|"))
    const [state = "", memory, swap, nano, period, quota] = containerLine?.split("|") ?? []
    const statsLine = (parts.get("stats") ?? []).find((line) => line.includes("|"))
    const [cpu, memUsage, memPerc] = statsLine?.split("|") ?? []
    const hostLine = (parts.get("host") ?? []).find((line) => line.includes("|"))
    const [ncpu, memTotal] = hostLine?.split("|") ?? []
    return {
        name,
        exists,
        driver: exists ? field(inspect, "Driver") : null,
        nodeStatus: exists ? field(inspect, "Status") : null,
        driverOpts,
        flags: flagsLine ? flagsLine.split(/\s+/).filter(Boolean) : [],
        current: (parts.get("current") ?? []).map((line) => line.trim()).find(Boolean) ?? null,
        container: containerLine ? { state: state.trim(), memoryBytes: number(memory), memorySwapBytes: number(swap), nanoCpus: number(nano), cpuPeriod: number(period), cpuQuota: number(quota) } : null,
        usage: statsLine ? { cpuPercent: percent(cpu), memoryUsage: (memUsage ?? "").trim(), memoryPercent: percent(memPerc) } : null,
        host: hostLine && number(ncpu) > 0 ? { cpus: number(ncpu), memoryGb: round2(number(memTotal) / GIB) } : null,
    }
}

/** Limites aplicados no container, nas unidades da configuração (GiB, swap além da RAM, CPUs). */
export function appliedLimits(container: BuilderContainerState): BuilderLimitsDto {
    const memoryGb = container.memoryBytes > 0 ? round2(container.memoryBytes / GIB) : null
    const swapGb = memoryGb !== null && container.memorySwapBytes > container.memoryBytes ? round2((container.memorySwapBytes - container.memoryBytes) / GIB) : null
    const cpus = container.nanoCpus > 0 ? round2(container.nanoCpus / 1e9) : container.cpuQuota > 0 && container.cpuPeriod > 0 ? round2(container.cpuQuota / container.cpuPeriod) : null
    return { memoryGb, swapGb, cpus }
}

/** `--cpus` (NanoCpus) ou quota: o `docker update` precisa seguir o modo que o container já usa. */
export const cpuModeOf = (container: BuilderContainerState | null): "nano" | "quota" => (container && container.nanoCpus > 0 ? "nano" : "quota")

const same = (a: number | null, b: number | null) => (a === null ? null : round2(a)) === (b === null ? null : round2(b))

/**
 * Os limites salvos diferem dos aplicados? Swap salvo vazio (padrão do Docker) aceita o aplicado vazio
 * ou igual à RAM (o padrão do Docker é o dobro da RAM no total).
 */
export function limitsDiffer(config: Pick<EnvironmentsBuilder, "memoryGb" | "cpus" | "swapGb">, applied: BuilderLimitsDto): boolean {
    if (!same(config.memoryGb, applied.memoryGb) || !same(config.cpus, applied.cpus)) return true
    if (config.memoryGb === null) return false
    if (config.swapGb === null) return !(applied.swapGb === null || same(applied.swapGb, config.memoryGb))
    return !same(config.swapGb, applied.swapGb ?? (config.swapGb === 0 ? 0 : null))
}

/** Flags que o Opex não recria. */
export const unknownFlags = (flags: string[]) => flags.filter((flag) => !KNOWN_FLAGS.has(flag))

/** A recriação muda algo que não dá para ajustar sem ela (limites ou flags)? */
export function needsRecreate(config: EnvironmentsBuilder, parsed: ParsedBuilderStatus): boolean {
    if (!parsed.exists || !parsed.container) return false
    if (limitsDiffer(config, appliedLimits(parsed.container))) return true
    return config.allowNetworkHost !== parsed.flags.includes(NETWORK_HOST_FLAG)
}
