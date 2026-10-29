import { endOfDay, parseISO, startOfDay } from "date-fns"
import { urlFilterCodecs, type UrlFilterCodec, type UrlFilterSchema } from "@/hooks/useUrlFilters"
import {
    PR_REVIEW_STATE_LABELS,
    PR_REVIEW_STATES,
    PR_REVIEW_TRIGGER_LABELS,
    PR_REVIEW_TRIGGERS,
    PR_REVIEW_VERDICT_LABELS,
    PR_REVIEW_VERDICTS,
    type PrReviewState,
    type PrReviewTrigger,
    type PrReviewVerdict,
} from "./constants"

/**
 * Filtros da página Agente Revisor (`/agente-revisor`): busca, situação, veredito, repositório,
 * origem e período. Tudo vive na URL (`useUrlFilters`) e vai à API, que faz o recorte. Módulo puro.
 */

export interface PrReviewFilters {
    /** Busca em repositório, número, título e autor do PR. */
    q: string
    states: PrReviewState[]
    verdicts: PrReviewVerdict[]
    /** `owner/repo`. */
    repos: string[]
    triggers: PrReviewTrigger[]
    /** Início do período (`yyyy-MM-dd`; vazio = sem início). */
    from: string
    /** Fim do período (`yyyy-MM-dd`; vazio = sem fim). */
    to: string
}

/** Parâmetros de `GET /api/pr-reviews` (listas em CSV, datas ISO; ausente = sem recorte). */
export type PrReviewListParams = Partial<Record<"q" | "states" | "verdicts" | "repos" | "triggers" | "from" | "to", string>>

export const DEFAULT_PR_REVIEW_FILTERS: PrReviewFilters = { q: "", states: [], verdicts: [], repos: [], triggers: [], from: "", to: "" }

const REPO = /^[\w.-]+\/[\w.-]+$/

/** Repositórios da URL: só os bem formados sobrevivem (a API valida a mesma regra). */
const repoList: UrlFilterCodec<string[]> = {
    parse: (raw, fallback) => (raw === null ? fallback : raw.split(",").map((value) => value.trim()).filter((value) => REPO.test(value))),
    serialize: (value) => value.join(","),
}

export const PR_REVIEW_FILTER_SCHEMA: UrlFilterSchema<PrReviewFilters> = {
    q: urlFilterCodecs.string(),
    states: urlFilterCodecs.strings<PrReviewState>(PR_REVIEW_STATES),
    verdicts: urlFilterCodecs.strings<PrReviewVerdict>(PR_REVIEW_VERDICTS),
    repos: repoList,
    triggers: urlFilterCodecs.strings<PrReviewTrigger>(PR_REVIEW_TRIGGERS),
    from: urlFilterCodecs.string(),
    to: urlFilterCodecs.string(),
}

export const PR_REVIEW_STATE_OPTIONS = PR_REVIEW_STATES.map((value) => ({ value, label: PR_REVIEW_STATE_LABELS[value] }))
export const PR_REVIEW_VERDICT_OPTIONS = PR_REVIEW_VERDICTS.map((value) => ({ value, label: PR_REVIEW_VERDICT_LABELS[value] }))
export const PR_REVIEW_TRIGGER_OPTIONS = PR_REVIEW_TRIGGERS.map((value) => ({ value, label: PR_REVIEW_TRIGGER_LABELS[value] }))

/** Há algum recorte? Decide o estado vazio e a ação "Limpar filtros". */
export function hasPrReviewFilters(filters: PrReviewFilters): boolean {
    return Boolean(filters.q.trim() || filters.from || filters.to) || [filters.states, filters.verdicts, filters.repos, filters.triggers].some((list) => list.length > 0)
}

/** Filtros da tela → parâmetros da API (período do dia inteiro no fuso do navegador, em ISO). */
export function toPrReviewListParams(filters: PrReviewFilters): PrReviewListParams {
    const params: PrReviewListParams = {}
    const q = filters.q.trim()
    if (q) params.q = q
    if (filters.states.length) params.states = filters.states.join(",")
    if (filters.verdicts.length) params.verdicts = filters.verdicts.join(",")
    if (filters.repos.length) params.repos = filters.repos.join(",")
    if (filters.triggers.length) params.triggers = filters.triggers.join(",")
    if (filters.from) params.from = startOfDay(parseISO(filters.from)).toISOString()
    if (filters.to) params.to = endOfDay(parseISO(filters.to)).toISOString()
    return params
}
