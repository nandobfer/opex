import { createdAtRange, mergeAnd, searchPattern } from "@/lib/list/query"
import type { AdversarialReviewListQuery } from "../schemas"

/** Filtro do Mongo da lista de rodadas do Agente Adversário (função pura: `GET /api/adversarial/reviews`). */

type ListFilterInput = Pick<AdversarialReviewListQuery, "q" | "states" | "decisions" | "levels" | "centrals"> & { from?: string; to?: string }

export function buildAdversarialReviewListFilter(query: ListFilterInput): Record<string, unknown> {
    const filter: Record<string, unknown> = {}
    const and: Record<string, unknown>[] = []

    const q = query.q.trim()
    if (q) and.push({ $or: [{ taskCode: searchPattern(q) }, { taskTitle: searchPattern(q) }] })

    if (query.states.length) filter.state = { $in: query.states }
    if (query.decisions.length) filter.decision = { $in: query.decisions }
    if (query.levels.length) filter.level = { $in: query.levels }
    if (query.centrals.length) filter.centralId = { $in: query.centrals }

    const createdAt = createdAtRange(query.from, query.to)
    if (createdAt) filter.createdAt = createdAt

    return mergeAnd(filter, and)
}
