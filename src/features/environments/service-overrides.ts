import { Document, isMap, type YAMLMap } from "yaml"
import { COMPOSE_TAGS, overrideYamlKeys, overrideYamlServices } from "./override-yaml"
import {
    DEPENDS_CONDITIONS,
    EMPTY_COMPOSE_OVERRIDES,
    RESTART_POLICIES,
    SERVICE_FIELD_KEYS,
    SERVICE_FIELDS,
    type ComposeKeyValue,
    type ComposeOverrides,
    type DependsOn,
    type HealthcheckOverride,
    type PortOverride,
    type ServiceField,
    type ServiceOverride,
    type ServiceValues,
    type VolumeOverride,
} from "./schemas"

/**
 * Serviços do compose (OPE-211), regras puras: leitura dos valores do compose (JSON do `config` ou o
 * YAML bruto do compose gerenciado), as chaves do override, o resumo e a comparação salvo × implantado.
 */

export const EMPTY_SERVICE_VALUES: ServiceValues = { image: null, command: null, entrypoint: null, environment: null, labels: null, ports: null, volumes: null, restart: null, healthcheck: null, dependsOn: null }

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value)
const text = (value: unknown): string => (value === null || value === undefined ? "" : String(value))

/** `command`/`entrypoint`: lista (exec) ou texto (dividido como o compose faz, por espaços e aspas simples). */
function args(value: unknown): string[] | null {
    if (value === undefined || value === null) return null
    if (Array.isArray(value)) return value.map(text)
    const raw = text(value).trim()
    if (!raw) return []
    return (raw.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((part) => part.replace(/^(["'])(.*)\1$/, "$2"))
}

/** `environment`/`labels`: mapa ou lista `CHAVE=valor`. */
function keyValues(value: unknown): ComposeKeyValue[] | null {
    if (value === undefined || value === null) return null
    if (Array.isArray(value)) {
        return value.map((item) => {
            const raw = text(item)
            const index = raw.indexOf("=")
            return index < 0 ? { key: raw, value: "" } : { key: raw.slice(0, index), value: raw.slice(index + 1) }
        })
    }
    if (isRecord(value)) return Object.entries(value).map(([key, item]) => ({ key, value: text(item) }))
    return null
}

/** Porta na forma curta: `[ip:][publicada:]alvo[/protocolo]`. */
function shortPort(raw: string): PortOverride | null {
    const [main = "", protocol = "tcp"] = raw.split("/")
    const ipMatch = /^(\[[^\]]+\]|\d{1,3}(?:\.\d{1,3}){3}):(.*)$/.exec(main)
    const hostIp = ipMatch ? ipMatch[1]!.replace(/^\[|\]$/g, "") : ""
    const rest = ipMatch ? ipMatch[2]! : main
    const parts = rest.split(":")
    const target = Number((parts.length > 1 ? parts[1] : parts[0])?.split("-")[0])
    if (!Number.isInteger(target) || target < 1) return null
    return { target, published: parts.length > 1 ? parts[0]! : "", protocol: protocol === "udp" ? "udp" : "tcp", hostIp }
}

function ports(value: unknown): PortOverride[] | null {
    if (!Array.isArray(value)) return value === undefined || value === null ? null : []
    return value
        .map((item): PortOverride | null => {
            if (typeof item === "number") return { target: item, published: "", protocol: "tcp", hostIp: "" }
            if (typeof item === "string") return shortPort(item)
            if (!isRecord(item)) return null
            const target = Number(item.target)
            if (!Number.isInteger(target) || target < 1) return null
            return { target, published: text(item.published), protocol: item.protocol === "udp" ? "udp" : "tcp", hostIp: text(item.host_ip) }
        })
        .filter((item): item is PortOverride => item !== null)
}

const isPath = (source: string) => source.startsWith(".") || source.startsWith("/") || source.startsWith("~") || source.startsWith("$")

function volumes(value: unknown): VolumeOverride[] | null {
    if (!Array.isArray(value)) return value === undefined || value === null ? null : []
    return value
        .map((item): VolumeOverride | null => {
            if (typeof item === "string") {
                const parts = item.split(":")
                if (parts.length === 1) return { type: "volume", source: "", target: parts[0]!, readOnly: false }
                const source = parts[0]!
                return { type: isPath(source) ? "bind" : "volume", source, target: parts[1]!, readOnly: (parts[2] ?? "").split(",").includes("ro") }
            }
            if (!isRecord(item) || typeof item.target !== "string") return null
            const type = item.type === "bind" || item.type === "tmpfs" ? item.type : "volume"
            return { type, source: text(item.source), target: item.target, readOnly: item.read_only === true }
        })
        .filter((item): item is VolumeOverride => item !== null)
}

const duration = (value: unknown) => (typeof value === "number" ? `${Math.round(value / 1_000_000)}ms` : text(value))

function healthcheck(value: unknown): HealthcheckOverride | null {
    if (!isRecord(value)) return null
    const test = Array.isArray(value.test) ? value.test.map(text) : typeof value.test === "string" ? ["CMD-SHELL", value.test] : []
    if (value.disable === true || test[0] === "NONE") return { mode: "disable" }
    if (!test.length) return null
    const retries = typeof value.retries === "number" ? value.retries : null
    const common = { interval: duration(value.interval), timeout: duration(value.timeout), startPeriod: duration(value.start_period), retries }
    if (test[0] === "CMD-SHELL") return { mode: "shell", test: [test.slice(1).join(" ")], ...common }
    return { mode: "exec", test: test[0] === "CMD" ? test.slice(1) : test, ...common }
}

function dependsOn(value: unknown): DependsOn[] | null {
    if (value === undefined || value === null) return null
    if (Array.isArray(value)) return value.map((service) => ({ service: text(service), condition: "service_started", restart: false }))
    if (!isRecord(value)) return null
    return Object.entries(value).map(([service, item]) => {
        const condition = isRecord(item) && (DEPENDS_CONDITIONS as readonly string[]).includes(text(item.condition)) ? (item.condition as DependsOn["condition"]) : "service_started"
        return { service, condition, restart: isRecord(item) && item.restart === true }
    })
}

/** Os dados do serviço no compose (JSON do `config` ou YAML bruto); `null` = não declarado. */
export function normalizeServiceValues(raw: unknown): ServiceValues {
    if (!isRecord(raw)) return { ...EMPTY_SERVICE_VALUES }
    const restart = text(raw.restart).split(":")[0]!
    return {
        image: typeof raw.image === "string" && raw.image ? raw.image : null,
        command: args(raw.command),
        entrypoint: args(raw.entrypoint),
        environment: keyValues(raw.environment),
        labels: keyValues(raw.labels),
        ports: ports(raw.ports),
        volumes: volumes(raw.volumes),
        restart: (RESTART_POLICIES as readonly string[]).includes(restart) ? (restart as ServiceValues["restart"]) : null,
        healthcheck: healthcheck(raw.healthcheck),
        dependsOn: dependsOn(raw.depends_on),
    }
}

/** Ajustes normalizados (`null`/ausente = nenhum). */
export const composeOverridesOf = (value: ComposeOverrides | null | undefined): ComposeOverrides => value ?? EMPTY_COMPOSE_OVERRIDES

/** Campos personalizados de um serviço. */
export const customizedFields = (override: ServiceOverride): ServiceField[] => SERVICE_FIELDS.filter((field) => override[field] !== null)

/** Serviços com imagem própria (bloco guiado ou `image` no YAML avançado): não buildam nem vão ao registry. */
export function ownImageServices(overrides: ComposeOverrides | null | undefined): string[] {
    const value = composeOverridesOf(overrides)
    const yamlKeys = overrideYamlKeys(value.yaml)
    const names = new Set(value.services.filter((item) => item.image !== null).map((item) => item.service))
    for (const [service, keys] of Object.entries(yamlKeys)) if (keys.includes("image")) names.add(service)
    return [...names]
}

/** Serviços citados nos ajustes (bloco guiado e YAML avançado). */
export function overrideServiceNames(overrides: ComposeOverrides | null | undefined): string[] {
    const value = composeOverridesOf(overrides)
    return [...new Set([...value.services.filter((item) => customizedFields(item).length).map((item) => item.service), ...Object.keys(overrideYamlKeys(value.yaml))])]
}

/** Bind mounts que o override acrescenta a um serviço (`origem:destino`). */
export function overrideBindMounts(overrides: ComposeOverrides | null | undefined, service: string): string[] {
    const value = composeOverridesOf(overrides)
    const guided = value.services.find((item) => item.service === service)?.volumes ?? []
    const yamlNode = overrideYamlServices(value.yaml).get(service)
    const yamlVolumes = volumes(yamlNode ? (yamlNode.toJSON() as Record<string, unknown>).volumes : undefined) ?? []
    return [...guided, ...yamlVolumes].filter((item) => item.type === "bind").map((item) => `${item.source}:${item.target}`)
}

/** Resumo de um serviço para o log, a linha e a auditoria (do `environment`, só as chaves). */
export function serviceOverrideText(override: ServiceOverride): string {
    const parts = customizedFields(override).map((field) => {
        if (field === "image") return `imagem ${override.image}`
        if (field === "environment") {
            const keys = override.environment!.map((item) => item.key)
            return keys.length ? `environment (${keys.length}: ${keys.join(", ")})` : "environment (vazio)"
        }
        if (field === "restart") return `restart ${override.restart}`
        if (field === "healthcheck") return override.healthcheck!.mode === "disable" ? "healthcheck desligado" : "healthcheck"
        const list = override[field]
        return Array.isArray(list) && field !== "command" && field !== "entrypoint" ? `${SERVICE_FIELD_KEYS[field]} (${list.length})` : SERVICE_FIELD_KEYS[field]
    })
    return parts.join(", ")
}

/** Resumo dos ajustes ("app imagem nginx:1.27, ports (2); YAML avançado: worker"); vazio = sem ajustes. */
export function composeOverridesText(overrides: ComposeOverrides | null | undefined): string {
    const value = composeOverridesOf(overrides)
    const services = value.services.filter((item) => customizedFields(item).length).map((item) => `${item.service} ${serviceOverrideText(item)}`)
    const yaml = Object.keys(overrideYamlKeys(value.yaml))
    if (yaml.length) services.push(`YAML avançado: ${yaml.join(", ")}`)
    return services.join("; ")
}

/** Total de campos personalizados (o YAML avançado conta uma chave por item). */
export function composeOverridesCount(overrides: ComposeOverrides | null | undefined): number {
    const value = composeOverridesOf(overrides)
    return value.services.reduce((sum, item) => sum + customizedFields(item).length, 0) + Object.values(overrideYamlKeys(value.yaml)).reduce((sum, keys) => sum + keys.length, 0)
}

/** Forma comparável: sem serviços vazios, em ordem de nome, YAML sem espaços nas pontas. */
function canonical(overrides: ComposeOverrides | null | undefined): string {
    const value = composeOverridesOf(overrides)
    const services = value.services
        .filter((item) => customizedFields(item).length)
        .map((item) => Object.fromEntries([["service", item.service], ...SERVICE_FIELDS.map((field) => [field, item[field]])]))
        .sort((a, b) => String(a.service).localeCompare(String(b.service)))
    return JSON.stringify({ services, yaml: value.yaml.trim() })
}

export const sameComposeOverrides = (a: ComposeOverrides | null | undefined, b: ComposeOverrides | null | undefined) => canonical(a) === canonical(b)

/** Selo da linha: ambiente implantado com ajustes salvos diferentes dos do último deploy. */
export function composeOverridesPendingDeploy(env: { composeOverrides: ComposeOverrides | null; deployedComposeOverrides: ComposeOverrides | null; deployedOn: unknown }): boolean {
    if (!env.deployedOn) return false
    return !sameComposeOverrides(env.composeOverrides, env.deployedComposeOverrides)
}

// --- Override ---------------------------------------------------------------------------------------

const toMap = (items: ComposeKeyValue[]) => Object.fromEntries(items.map((item) => [item.key, item.value]))

function portEntry(port: PortOverride): Record<string, unknown> {
    return { target: port.target, ...(port.published ? { published: port.published } : {}), protocol: port.protocol, ...(port.hostIp ? { host_ip: port.hostIp } : {}) }
}

function volumeEntry(volume: VolumeOverride): Record<string, unknown> {
    return { type: volume.type, ...(volume.source ? { source: volume.source } : {}), target: volume.target, ...(volume.readOnly ? { read_only: true } : {}) }
}

function healthcheckEntry(check: HealthcheckOverride): Record<string, unknown> {
    if (check.mode === "disable") return { disable: true }
    const test = check.mode === "shell" ? ["CMD-SHELL", check.test.join(" ")] : ["CMD", ...check.test]
    return { test, ...(check.interval ? { interval: check.interval } : {}), ...(check.timeout ? { timeout: check.timeout } : {}), ...(check.startPeriod ? { start_period: check.startPeriod } : {}), ...(check.retries !== null ? { retries: check.retries } : {}) }
}

/** Valor de cada campo no override e se ele substitui o do compose por inteiro (`!override`). */
function fieldEntry(field: ServiceField, override: ServiceOverride): { value: unknown; tag?: "!override" | "!reset" } {
    switch (field) {
        case "image":
            return { value: override.image }
        case "command":
        case "entrypoint": {
            const list = override[field]!
            return list.length ? { value: list } : { value: null, tag: "!reset" }
        }
        case "environment":
        case "labels":
            return { value: toMap(override[field]!), tag: "!override" }
        case "ports":
            return { value: override.ports!.map(portEntry), tag: "!override" }
        case "volumes":
            return { value: override.volumes!.map(volumeEntry), tag: "!override" }
        case "restart":
            return { value: override.restart }
        case "healthcheck":
            return { value: healthcheckEntry(override.healthcheck!), tag: "!override" }
        case "dependsOn":
            return { value: Object.fromEntries(override.dependsOn!.map((item) => [item.service, { condition: item.condition, restart: item.restart }])), tag: "!override" }
    }
}

/**
 * Linhas extras de um serviço no override (já com o recuo do serviço): os campos personalizados, o
 * `build: !reset null` quando há imagem própria e, por último, as chaves do YAML avançado. Os valores
 * vão como estão (`${VAR}` é interpolado pelo compose, como no arquivo do projeto).
 */
export function serviceOverrideLines(override: ServiceOverride | undefined, yamlNode: YAMLMap | undefined, options: { ownImage: boolean }): string[] {
    const doc = new Document({}, { customTags: COMPOSE_TAGS })
    const map = doc.contents as YAMLMap
    if (override) {
        for (const field of customizedFields(override)) {
            const entry = fieldEntry(field, override)
            const node = doc.createNode(entry.value)
            if (entry.tag) node.tag = entry.tag
            map.set(SERVICE_FIELD_KEYS[field], node)
        }
    }
    if (options.ownImage) {
        const reset = doc.createNode(null)
        reset.tag = "!reset"
        map.set("build", reset)
    }
    if (yamlNode && isMap(yamlNode)) for (const pair of yamlNode.items) map.set(pair.key, pair.value)
    if (!map.items.length) return []
    return doc
        .toString({ lineWidth: 0 })
        .replace(/\n$/, "")
        .split("\n")
        .map((line) => `    ${line}`)
}

/** Volumes nomeados que os ajustes usam (declarados no topo do override para o compose aceitar). */
export function namedVolumes(overrides: ComposeOverrides | null | undefined, services: string[]): string[] {
    const value = composeOverridesOf(overrides)
    const names = value.services.filter((item) => services.includes(item.service)).flatMap((item) => (item.volumes ?? []).filter((volume) => volume.type === "volume" && volume.source).map((volume) => volume.source))
    return [...new Set(names)]
}
