import type { ZodError } from "zod"
import { secretarySettingsSchema, type SecretaryCriteria, type SecretarySettings, type SubjectRule } from "./schemas"

/**
 * Alterações parciais da configuração do Agente Secretário (PURO), usadas pelas ferramentas do Agente Opex (OPE-200):
 * cada patch mexe só no que veio e a validação final é a MESMA da tela e da rota (`secretarySettingsSchema`).
 */

/** Nome comparável: sem acento, sem diferença de caixa e com espaços normalizados. */
export function normalizeName(value: string): string {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ")
}

/** Identificador estável do assunto a partir do nome (único na lista). */
export function subjectIdOf(name: string, existing: readonly string[]): string {
    const base = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "assunto"
    let id = base
    for (let n = 2; existing.includes(id); n++) id = `${base}-${n}`
    return id
}

/** Modelo secundário pedido: "Mesmo do agente" (mantém o provedor/modelo guardados, como a tela) ou outro. */
export interface SecondaryModelInput {
    sameAsAgent: boolean
    provider?: string | null
    model?: string | null
    variant?: string | null
}

export interface GeneralPatch {
    temperature?: number | null
    media?: { readImages?: boolean; transcribeAudio?: boolean; model?: SecondaryModelInput }
    analysisModel?: SecondaryModelInput
    decisionModel?: SecondaryModelInput
    human?: Partial<SecretarySettings["human"]>
    pauseMinutes?: number
    limits?: Partial<SecretarySettings["limits"]>
    prices?: { provider: string; model: string; inputPerMTok: number; outputPerMTok: number }[]
}

type SecondaryRef = SecretarySettings["media"]["model"] | SecretarySettings["decision"]["model"]

function secondary<T extends SecondaryRef>(current: T, input: SecondaryModelInput | undefined): T {
    if (!input) return current
    if (input.sameAsAgent) return { ...current, sameAsAgent: true }
    return { ...current, sameAsAgent: false, provider: (input.provider ?? null) as T["provider"], model: input.model ?? null, variant: input.variant ?? null, agent: null }
}

export function applyGeneralPatch(settings: SecretarySettings, patch: GeneralPatch): SecretarySettings {
    const pricing = { ...settings.pricing }
    for (const price of patch.prices ?? []) pricing[`${price.provider}/${price.model}`] = { inputPerMTok: price.inputPerMTok, outputPerMTok: price.outputPerMTok }
    return {
        ...settings,
        main: patch.temperature === undefined ? settings.main : { ...settings.main, temperature: patch.temperature },
        media: {
            readImages: patch.media?.readImages ?? settings.media.readImages,
            transcribeAudio: patch.media?.transcribeAudio ?? settings.media.transcribeAudio,
            model: secondary(settings.media.model, patch.media?.model),
        },
        analysis: { model: secondary(settings.analysis.model, patch.analysisModel) },
        decision: { model: secondary(settings.decision.model, patch.decisionModel) },
        human: { ...settings.human, ...patch.human },
        pauseMinutes: patch.pauseMinutes ?? settings.pauseMinutes,
        limits: { ...settings.limits, ...patch.limits },
        pricing,
    }
}

export interface AudiencePatch {
    mode?: SecretaryCriteria["audience"]["mode"]
    direct?: boolean
    groups?: boolean
    groupReply?: SecretaryCriteria["audience"]["groupReply"]
    /** JIDs já resolvidos pelo servidor (o dono fala pelo nome). */
    addSelected?: string[]
    removeSelected?: string[]
    addBlocked?: string[]
    removeBlocked?: string[]
}

const without = (list: readonly string[], remove: readonly string[] = []) => list.filter((item) => !remove.includes(item))
const withAdded = (list: readonly string[], add: readonly string[] = []) => [...list, ...add.filter((item, index) => !list.includes(item) && add.indexOf(item) === index)]

export function applyAudiencePatch(settings: SecretarySettings, patch: AudiencePatch): SecretarySettings {
    const audience = settings.criteria.audience
    return {
        ...settings,
        criteria: {
            ...settings.criteria,
            audience: {
                mode: patch.mode ?? audience.mode,
                direct: patch.direct ?? audience.direct,
                groups: patch.groups ?? audience.groups,
                groupReply: patch.groupReply ?? audience.groupReply,
                selected: withAdded(without(audience.selected, patch.removeSelected), patch.addSelected),
                blocked: withAdded(without(audience.blocked, patch.removeBlocked), patch.addBlocked),
            },
        },
    }
}

export type SubjectList = "blocked" | "allowed"
export const SUBJECT_LIST_LABELS: Record<SubjectList, string> = { blocked: "assuntos bloqueados", allowed: "assuntos liberados" }

export interface SubjectInput {
    name: string
    /** Novo nome (renomear um assunto existente). */
    newName?: string
    description?: string
    examples?: string[]
}

/** Assunto recusado com o motivo (nome repetido entre as listas, assunto ambíguo): a mensagem vai ao dono. */
export class SubjectRuleError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "SubjectRuleError"
    }
}

const OTHER_LIST: Record<SubjectList, SubjectList> = { blocked: "allowed", allowed: "blocked" }

/**
 * Cria (nome novo) ou edita (mesmo nome, sem diferença de caixa ou acento) um assunto da lista. Um nome — o novo ou o
 * do renomear — que já existe na outra lista (ou em outro assunto da mesma) é recusado: o mesmo assunto não pode ser
 * bloqueado e liberado ao mesmo tempo.
 */
export function upsertSubject(settings: SecretarySettings, list: SubjectList, input: SubjectInput): { settings: SecretarySettings; created: boolean } {
    const rules = settings.criteria.subjects[list]
    const index = rules.findIndex((rule) => normalizeName(rule.name) === normalizeName(input.name))
    const finalName = input.newName?.trim() || (index >= 0 ? rules[index].name : input.name.trim())
    const other = settings.criteria.subjects[OTHER_LIST[list]].find((rule) => normalizeName(rule.name) === normalizeName(finalName))
    if (other) throw new SubjectRuleError(`O assunto "${other.name}" já está nos ${SUBJECT_LIST_LABELS[OTHER_LIST[list]]}: remova-o de lá antes (remove_secretary_subject) ou use outro nome.`)
    const twin = rules.find((rule, at) => at !== index && normalizeName(rule.name) === normalizeName(finalName))
    if (twin) throw new SubjectRuleError(`Já existe o assunto "${twin.name}" nos ${SUBJECT_LIST_LABELS[list]}: escolha outro nome.`)
    let next: SubjectRule[]
    if (index >= 0) {
        const current = rules[index]
        next = rules.map((rule, at) => (at === index ? { ...current, name: input.newName?.trim() || current.name, description: input.description ?? current.description, examples: input.examples ?? current.examples } : rule))
    } else {
        const name = input.newName?.trim() || input.name.trim()
        next = [...rules, { id: subjectIdOf(name, rules.map((rule) => rule.id)), name, description: input.description ?? "", examples: input.examples ?? [] }]
    }
    return { settings: { ...settings, criteria: { ...settings.criteria, subjects: { ...settings.criteria.subjects, [list]: next } } }, created: index < 0 }
}

/**
 * Remove um assunto pelo nome (na lista indicada ou nas duas); `null` quando não existe. Sem a lista, um nome presente
 * nas duas (configuração antiga) é recusado pedindo a lista, em vez de remover o primeiro encontrado.
 */
export function removeSubject(settings: SecretarySettings, name: string, list?: SubjectList): { settings: SecretarySettings; list: SubjectList; removed: SubjectRule } | null {
    const inList = (key: SubjectList) => settings.criteria.subjects[key].some((rule) => normalizeName(rule.name) === normalizeName(name))
    if (!list && inList("blocked") && inList("allowed")) throw new SubjectRuleError(`O assunto "${name}" está nos assuntos bloqueados e nos liberados: informe a lista (blocked ou allowed).`)
    for (const key of list ? [list] : (["blocked", "allowed"] as const)) {
        const rules = settings.criteria.subjects[key]
        const removed = rules.find((rule) => normalizeName(rule.name) === normalizeName(name))
        if (removed) return { settings: { ...settings, criteria: { ...settings.criteria, subjects: { ...settings.criteria.subjects, [key]: rules.filter((rule) => rule !== removed) } } }, list: key, removed }
    }
    return null
}

/** Rótulos dos campos numéricos (as mensagens do schema para eles são só a faixa: "Máximo 200"). */
const FIELD_LABELS: Record<string, string> = {
    "main.temperature": "Temperatura do agente",
    "human.groupingSeconds": "Agrupar mensagens (s)",
    "human.delayMinSeconds": "Atraso mínimo (s)",
    "human.delayMaxSeconds": "Atraso máximo (s)",
    pauseMinutes: "Pausa quando o dono responde (min)",
    "limits.repliesPerHour": "Respostas por conversa por hora",
    "limits.dailyBudgetUsd": "Orçamento diário (US$)",
    "media.model.model": "Modelo de mídia",
    "analysis.model.model": "Modelo da análise",
    "decision.model.model": "Quem decide o assunto",
    "criteria.subjects.blocked": "Assuntos bloqueados",
    "criteria.subjects.allowed": "Assuntos liberados",
}

/** Mensagens legíveis, sem repetição, de uma validação recusada. */
export function settingsIssueMessages(error: ZodError): string[] {
    const out: string[] = []
    for (const issue of error.issues) {
        const path = issue.path.map(String).join(".")
        const label = FIELD_LABELS[path] ?? (path.startsWith("criteria.subjects.") ? "Assuntos" : path.startsWith("pricing") ? "Preços estimados" : null)
        const text = label && !issue.message.includes(label) && issue.code !== "custom" ? `${label}: ${issue.message}` : issue.message
        if (!out.includes(text)) out.push(text)
    }
    return out
}

export function formatSettingsIssues(error: ZodError): string {
    return `Não foi possível gravar a configuração do Agente Secretário: ${settingsIssueMessages(error).join("; ")}. Nada foi alterado.`
}

/** O que falta para ligar o agente: as mesmas regras do schema, com a configuração atual ligada. */
export function secretaryReadiness(settings: SecretarySettings): { canEnable: boolean; missing: string[] } {
    const parsed = secretarySettingsSchema.safeParse({ ...settings, enabled: true })
    return parsed.success ? { canEnable: true, missing: [] } : { canEnable: false, missing: settingsIssueMessages(parsed.error) }
}
