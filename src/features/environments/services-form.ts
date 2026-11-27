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

/** Troca um campo de um serviço (`null` = volta a valer o do compose). */
export function setOverrideField<F extends ServiceField>(overrides: ComposeOverrides, service: string, field: F, value: ServiceValues[F]): ComposeOverrides {
    return { ...overrides, services: overrides.services.map((item) => (item.service === service ? { ...item, [field]: value } : item)) }
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

export const customizedCount = (override: ServiceOverride) => SERVICE_FIELDS.filter((field) => override[field] !== null).length

/** Serviços do bloco que não estão no compose lido (`null` = ainda não lido). */
export function orphanOverrideServices(overrides: ComposeOverrides, names: string[] | null): string[] {
    if (!names) return []
    return overrides.services.map((item) => item.service).filter((service) => !names.includes(service))
}

/** Chaves do environment do serviço que também estão nas Variáveis extras (o environment vence). */
export function shadowedEnvKeys(override: ServiceOverride, envKeys: string[]): string[] {
    return (override.environment ?? []).map((item) => item.key).filter((key) => key && envKeys.includes(key))
}

/** Executar no PC: portas publicadas que não estão em Portas (o repasse do PC não é automático). */
export function unforwardedPorts(override: ServiceOverride, ports: number[], runOn: Machine): string[] {
    if (runOn !== "pc") return []
    return (override.ports ?? []).map((port) => port.published).filter((published) => published && !published.includes("-") && !ports.includes(Number(published)))
}
