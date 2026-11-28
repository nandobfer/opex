import { overrideYaml, type ComposeService } from "./compose-config"
import { HIDDEN_VALUE } from "./opex-format"
import { limitsForService } from "./resource-limits"
import { composeOverridesOf } from "./service-overrides"
import type { ComposeOverrides, EnvironmentInput, EnvironmentLimits, Machine } from "./schemas"
import type { ComposeServicesDto } from "./types"

/** Regras (puras) da página Novo/Editar ambiente (OPE-211): seções, alterações, erros e a prévia do deploy. */

export const EDITOR_SECTIONS = ["identidade", "origem", "execucao", "variaveis", "recursos", "servicos"] as const
export type EditorSection = (typeof EDITOR_SECTIONS)[number]

export const EDITOR_SECTION_LABELS: Record<EditorSection, string> = {
    identidade: "Identificação",
    origem: "Origem",
    execucao: "Execução",
    variaveis: "Variáveis extras",
    recursos: "Recursos",
    servicos: "Serviços do compose",
}

/** Campo raiz do formulário → seção. */
const FIELD_SECTION: Record<keyof EnvironmentInput, EditorSection> = {
    name: "identidade",
    slug: "identidade",
    source: "origem",
    compose: "origem",
    buildOn: "execucao",
    runOn: "execucao",
    ports: "execucao",
    healthUrl: "execucao",
    env: "variaveis",
    limits: "recursos",
    composeOverrides: "servicos",
}

/** Âncora da seção na página. */
export const sectionAnchor = (section: EditorSection) => `ambiente-${section}`

/** Há algum valor marcado (alterado/com erro) dentro do objeto do react-hook-form? */
function flagged(value: unknown): boolean {
    if (value === true) return true
    if (!value || typeof value !== "object") return false
    if ("message" in value && typeof (value as { message?: unknown }).message === "string") return true
    if ("type" in value && typeof (value as { type?: unknown }).type === "string") return true
    return Object.values(value as Record<string, unknown>).some(flagged)
}

function sectionsOf(tree: unknown): EditorSection[] {
    if (!tree || typeof tree !== "object") return []
    const found = new Set<EditorSection>()
    for (const [field, value] of Object.entries(tree as Record<string, unknown>)) {
        const section = FIELD_SECTION[field as keyof EnvironmentInput]
        if (section && flagged(value)) found.add(section)
    }
    return EDITOR_SECTIONS.filter((section) => found.has(section))
}

/** Seções com alterações não salvas (a partir de `formState.dirtyFields`). */
export const dirtySections = (dirtyFields: unknown): EditorSection[] => sectionsOf(dirtyFields)
/** Seções com erro de validação (a partir de `formState.errors`). */
export const errorSections = (errors: unknown): EditorSection[] => sectionsOf(errors)
/** Primeira seção (na ordem da página) com erro. */
export const firstErrorSection = (errors: unknown): EditorSection | null => errorSections(errors)[0] ?? null

const joinLabels = (sections: EditorSection[]) => {
    const labels = sections.map((section) => EDITOR_SECTION_LABELS[section])
    return labels.length <= 1 ? (labels[0] ?? "") : `${labels.slice(0, -1).join(", ")} e ${labels.at(-1)}`
}

export type EditorStatus = { kind: "saved" } | { kind: "dirty"; text: string } | { kind: "error"; text: string; section: EditorSection }

/** Status ao lado do Salvar: erros primeiro, depois as alterações; sem nada, "Tudo salvo". */
export function editorStatus(input: { dirty: EditorSection[]; errors: EditorSection[]; creating: boolean }): EditorStatus {
    if (input.errors.length) return { kind: "error", text: input.errors.length === 1 ? `Erro em ${joinLabels(input.errors)}` : `${input.errors.length} seções com erro`, section: input.errors[0]! }
    if (input.dirty.length) return { kind: "dirty", text: `Alterações não salvas em ${joinLabels(input.dirty)}` }
    return input.creating ? { kind: "dirty", text: "Ambiente ainda não criado" } : { kind: "saved" }
}

/** Ajustes com os valores do environment trocados por `[valor oculto]` (a prévia não mostra segredo). */
export function maskComposeOverrides(overrides: ComposeOverrides | null | undefined): ComposeOverrides {
    const value = composeOverridesOf(overrides)
    return { ...value, services: value.services.map((item) => (item.environment ? { ...item, environment: item.environment.map((entry) => ({ key: entry.key, value: HIDDEN_VALUE })) } : item)) }
}

/**
 * "O que muda no deploy": o `docker-compose.opex.yml` que o próximo deploy vai gerar, pela mesma função do
 * deploy (`overrideYaml`), com os serviços do compose lido. A imagem do registry (build e execução em
 * máquinas diferentes) usa marcadores (`<porta>`, `<commit>`), que só existem no deploy.
 */
export function deployPreview(input: { read: ComposeServicesDto; slug: string; buildOn: Machine; runOn: Machine; hasVars: boolean; limits: EnvironmentLimits; overrides: ComposeOverrides | null; selected: string[] }): string {
    const services: ComposeService[] = input.read.services
        .filter((service) => !input.selected.length || input.selected.includes(service.name))
        .map((service) => ({ name: service.name, hasBuild: service.hasBuild, bindMounts: [], hasWatch: false, declared: service.declared, limitStyle: service.limitStyle, values: service.values, unreadable: service.unreadable }))
    const cross = input.buildOn !== input.runOn
    const images = cross ? Object.fromEntries(services.filter((service) => service.hasBuild).map((service) => [service.name, `localhost:<porta>/opex-env/${input.slug || "<slug>"}-${service.name}:<commit>`])) : {}
    const limits = Object.fromEntries(services.map((service) => [service.name, limitsForService(input.limits, service.name)]))
    return overrideYaml({ services, images, withEnvFile: input.hasVars, limits, overrides: maskComposeOverrides(input.overrides) })
}
