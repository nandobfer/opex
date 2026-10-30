import { urlFilterCodecs, type UrlFilterSchema } from "@/hooks/useUrlFilters"
import { dayCodec, dayRangeParams } from "@/lib/list/day-filter"
import { centralIdList } from "../filters"
import {
    MENTOR_RUN_STATUS_LABELS,
    MENTOR_RUN_STATUSES,
    MENTOR_SOURCE_LABELS,
    MENTOR_SOURCES,
    MENTOR_USER_TRIGGER_LABELS,
    MENTOR_USER_TRIGGERS,
    type MentorRunStatus,
    type MentorSource,
    type MentorUserTrigger,
} from "./constants"

/**
 * Filtros da página Agente Mentor (`/agente-mentor`): busca, situação, origem, gatilho, central e
 * período. Tudo vive na URL (`useUrlFilters`) e vai à API, que faz o recorte. Módulo puro.
 */

export interface MentorRunFilters {
    /** Busca no código e no título da tarefa. */
    q: string
    statuses: MentorRunStatus[]
    sources: MentorSource[]
    triggers: MentorUserTrigger[]
    /** Ids das centrais. */
    centrals: string[]
    from: string
    to: string
}

/** Parâmetros de `GET /api/adversarial/mentor/runs` (listas em CSV, datas ISO; ausente = sem recorte). */
export type MentorRunListParams = Partial<Record<"q" | "statuses" | "sources" | "triggers" | "centrals" | "from" | "to" | "limit", string>>

export const DEFAULT_MENTOR_RUN_FILTERS: MentorRunFilters = { q: "", statuses: [], sources: [], triggers: [], centrals: [], from: "", to: "" }

export const MENTOR_RUN_FILTER_SCHEMA: UrlFilterSchema<MentorRunFilters> = {
    q: urlFilterCodecs.string(),
    statuses: urlFilterCodecs.strings<MentorRunStatus>(MENTOR_RUN_STATUSES),
    sources: urlFilterCodecs.strings<MentorSource>(MENTOR_SOURCES),
    triggers: urlFilterCodecs.strings<MentorUserTrigger>(MENTOR_USER_TRIGGERS),
    centrals: centralIdList,
    from: dayCodec,
    to: dayCodec,
}

export const MENTOR_STATUS_OPTIONS = MENTOR_RUN_STATUSES.map((value) => ({ value, label: MENTOR_RUN_STATUS_LABELS[value] }))
export const MENTOR_SOURCE_OPTIONS = MENTOR_SOURCES.map((value) => ({ value, label: MENTOR_SOURCE_LABELS[value] }))
export const MENTOR_TRIGGER_OPTIONS = MENTOR_USER_TRIGGERS.map((value) => ({ value, label: MENTOR_USER_TRIGGER_LABELS[value].label }))

/** Há algum recorte? Decide o estado vazio e a ação "Limpar filtros". */
export function hasMentorRunFilters(filters: MentorRunFilters): boolean {
    return Boolean(filters.q.trim() || filters.from || filters.to) || [filters.statuses, filters.sources, filters.triggers, filters.centrals].some((list) => list.length > 0)
}

/** Filtros da tela → parâmetros da API (período do dia inteiro no fuso do navegador, em ISO). */
export function toMentorRunListParams(filters: MentorRunFilters): MentorRunListParams {
    const params: MentorRunListParams = {}
    const q = filters.q.trim()
    if (q) params.q = q
    if (filters.statuses.length) params.statuses = filters.statuses.join(",")
    if (filters.sources.length) params.sources = filters.sources.join(",")
    if (filters.triggers.length) params.triggers = filters.triggers.join(",")
    if (filters.centrals.length) params.centrals = filters.centrals.join(",")
    return { ...params, ...dayRangeParams(filters.from, filters.to) }
}
