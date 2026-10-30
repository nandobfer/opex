import { createdAtRange, mergeAnd, searchPattern } from "@/lib/list/query"
import type { MentorRunListQuery } from "../../mentor/schemas"

/** Filtro do Mongo da lista de execuções do Agente Mentor (função pura: `GET /api/adversarial/mentor/runs`). */

type ListFilterInput = Pick<MentorRunListQuery, "q" | "statuses" | "sources" | "triggers" | "centrals"> & { from?: string; to?: string }

export function buildMentorRunListFilter(query: ListFilterInput): Record<string, unknown> {
    const filter: Record<string, unknown> = {}
    const and: Record<string, unknown>[] = []

    const q = query.q.trim()
    if (q) and.push({ $or: [{ taskCode: searchPattern(q) }, { taskTitle: searchPattern(q) }] })

    if (query.statuses.length) filter.status = { $in: query.statuses }
    // `sources` é uma lista: a execução entra se tiver ao menos uma das origens escolhidas.
    if (query.sources.length) filter.sources = { $in: query.sources }
    if (query.triggers.length) filter.trigger = { $in: query.triggers }
    if (query.centrals.length) filter.centralId = { $in: query.centrals }

    const createdAt = createdAtRange(query.from, query.to)
    if (createdAt) filter.createdAt = createdAt

    return mergeAnd(filter, and)
}
