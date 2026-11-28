import { EMPTY_SERVICE_VALUES } from "./service-overrides"
import { SERVICE_FIELDS, type ComposeOverrides, type Machine, type ServiceField, type ServiceOverride, type ServiceValues } from "./schemas"

/** Regras (puras) do bloco "Serviços do compose" do formulário do ambiente (OPE-211). */

export const SERVICE_FIELD_LABELS: Record<ServiceField, string> = {
    image: "Imagem",
    command: "Command",
    entrypoint: "Entrypoint",
    environment: "Environment",
    labels: "Labels",
    ports: "Portas publicadas",
    volumes: "Volumes",
    restart: "Restart",
    healthcheck: "Healthcheck",
    dependsOn: "Depende de",
}

export const emptyOverride = (service: string): ServiceOverride => ({ service, ...EMPTY_SERVICE_VALUES })

/** Acrescenta um serviço (sem nenhum campo personalizado); repetido não entra de novo. */
export function addOverrideService(overrides: ComposeOverrides, service: string): ComposeOverrides {
    if (overrides.services.some((item) => item.service === service)) return overrides
    return { ...overrides, services: [...overrides.services, emptyOverride(service)] }
}

export const removeOverrideService = (overrides: ComposeOverrides, service: string): ComposeOverrides => ({ ...overrides, services: overrides.services.filter((item) => item.service !== service) })

/**
 * Troca um campo de um serviço (`null` = volta a valer o do compose). O serviço entra nos ajustes no
 * primeiro campo editado e sai quando nenhum campo fica personalizado.
 */
export function setOverrideField<F extends ServiceField>(overrides: ComposeOverrides, service: string, field: F, value: ServiceValues[F]): ComposeOverrides {
    const base = addOverrideService(overrides, service)
    const services = base.services.map((item) => (item.service === service ? { ...item, [field]: value } : item)).filter((item) => item.service !== service || customizedCount(item) > 0)
    return { ...base, services }
}

/** Valor inicial ao ligar "Personalizar": o do compose (quando lido) ou o campo vazio. */
export function initialFieldValue<F extends ServiceField>(field: F, compose: ServiceValues | null): NonNullable<ServiceValues[F]> {
    const fromCompose = compose?.[field]
    if (fromCompose !== null && fromCompose !== undefined) return structuredClone(fromCompose) as NonNullable<ServiceValues[F]>
    const empty: { [K in ServiceField]: NonNullable<ServiceValues[K]> } = {
        image: "",
        command: [],
        entrypoint: [],
        environment: [],
        labels: [],
        ports: [],
        volumes: [],
        restart: "unless-stopped",
        healthcheck: { mode: "shell", test: [""], interval: "", timeout: "", startPeriod: "", retries: null },
        dependsOn: [],
    }
    return empty[field] as NonNullable<ServiceValues[F]>
}

/** Texto "Do compose" de um campo (desligado); `null` = não declarado. */
export function composeFieldText(field: ServiceField, compose: ServiceValues | null): string | null {
    const value = compose?.[field]
    if (value === null || value === undefined) return null
    switch (field) {
        case "image":
        case "restart":
            return String(value)
        case "command":
        case "entrypoint":
            return (value as string[]).length ? (value as string[]).join(" ") : "(vazio)"
        case "environment":
        case "labels": {
            const keys = (value as { key: string }[]).map((item) => item.key)
            return keys.length ? keys.join(", ") : "(vazio)"
        }
        case "ports":
            return (value as ServiceValues["ports"] & object).map((port) => `${port.hostIp ? `${port.hostIp}:` : ""}${port.published ? `${port.published}:` : ""}${port.target}/${port.protocol}`).join(", ") || "(nenhuma)"
        case "volumes":
            return (value as ServiceValues["volumes"] & object).map((volume) => `${volume.source || "(anônimo)"}:${volume.target}${volume.readOnly ? ":ro" : ""}`).join(", ") || "(nenhum)"
        case "healthcheck": {
            const check = value as NonNullable<ServiceValues["healthcheck"]>
            return check.mode === "disable" ? "desligado" : check.test.join(" ")
        }
        case "dependsOn":
            return (value as ServiceValues["dependsOn"] & object).map((item) => item.service).join(", ") || "(nenhum)"
    }
}

export function customizedCount(override: ServiceOverride): number {
    return SERVICE_FIELDS.filter((field) => override[field] !== null).length
}

/** Grupos do painel do serviço (OPE-211, página): campos na ordem em que aparecem. */
export const SERVICE_FIELD_GROUPS: { id: string; title: string; fields: ServiceField[] }[] = [
    { id: "imagem", title: "Imagem e comando", fields: ["image", "command", "entrypoint"] },
    { id: "rede", title: "Rede", fields: ["ports", "dependsOn"] },
    { id: "armazenamento", title: "Armazenamento", fields: ["volumes"] },
    { id: "saude", title: "Saúde e ciclo", fields: ["healthcheck", "restart"] },
    { id: "variaveis", title: "Variáveis e labels", fields: ["environment", "labels"] },
]

export interface ServiceListItem {
    name: string
    /** Dados do compose (`null` = o serviço não está no compose lido; `undefined` = compose não lido). */
    compose: ServiceValues | null | undefined
    hasBuild: boolean
    customized: number
    ownImage: boolean
    /** Não está entre os serviços escolhidos na Origem (só quando há escolha). */
    outside: boolean
    /** Tem ajuste salvo, mas não está no compose lido. */
    orphan: boolean
}

/**
 * Itens da lista de serviços: os do compose lido (na ordem do compose) e, depois, os que têm ajuste ou
 * limite mas não estão no compose (ou ainda não há leitura).
 */
export function serviceListItems(input: {
    read: { name: string; hasBuild: boolean; values: ServiceValues }[] | null
    overrides: ComposeOverrides
    limitServices: string[]
    selected: string[]
    running: string[]
}): ServiceListItem[] {
    const names = input.read ? input.read.map((service) => service.name) : []
    const extra = [...input.overrides.services.map((item) => item.service), ...input.limitServices, ...(input.read ? [] : input.running)].filter((name, index, all) => !names.includes(name) && all.indexOf(name) === index)
    return [...names, ...extra].map((name) => {
        const read = input.read?.find((service) => service.name === name)
        const override = input.overrides.services.find((item) => item.service === name)
        return {
            name,
            compose: input.read ? (read?.values ?? null) : undefined,
            hasBuild: read?.hasBuild ?? false,
            customized: override ? customizedCount(override) : 0,
            ownImage: Boolean(override && override.image !== null),
            outside: input.selected.length > 0 && !input.selected.includes(name),
            orphan: Boolean(input.read) && !read && (Boolean(override) || input.limitServices.includes(name)),
        }
    })
}

/** Chaves do environment do serviço que também estão nas Variáveis extras (o environment vence). */
export function shadowedEnvKeys(override: ServiceOverride, envKeys: string[]): string[] {
    return (override.environment ?? []).map((item) => item.key).filter((key) => key && envKeys.includes(key))
}

/** Executar no PC: portas publicadas que não estão em Portas (o repasse do PC não é automático). */
export function unforwardedPorts(override: ServiceOverride, ports: number[], runOn: Machine): string[] {
    if (runOn !== "pc") return []
    return (override.ports ?? []).map((port) => port.published).filter((published) => published && !published.includes("-") && !published.includes("$") && !ports.includes(Number(published)))
}
