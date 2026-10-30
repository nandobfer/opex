import { createdAtRange, mergeAnd, searchPattern } from "@/lib/list/query"
import type { PrReviewListQuery } from "../schemas"

/** Filtro do Mongo da lista do Agente Revisor (função pura: `GET /api/pr-reviews`). */

type ListFilterInput = Pick<PrReviewListQuery, "q" | "states" | "verdicts" | "repos" | "triggers"> & { from?: string; to?: string }

export function buildPrReviewListFilter(query: ListFilterInput): Record<string, unknown> {
    const filter: Record<string, unknown> = {}
    const and: Record<string, unknown>[] = []

    const q = query.q.trim()
    if (q) {
        const pattern = searchPattern(q)
        const or: Record<string, unknown>[] = [{ repo: pattern }, { title: pattern }, { author: pattern }]
        const number = /^#?(\d{1,9})$/.exec(q)
        if (number) or.push({ number: Number(number[1]) })
        and.push({ $or: or })
    }

    if (query.states.length) filter.state = { $in: query.states }
    if (query.verdicts.length) filter.verdict = { $in: query.verdicts }
    if (query.repos.length) filter.repo = { $in: query.repos }
    // Revisões antigas sem `trigger` contam como automáticas (mesma regra do DTO).
    if (query.triggers.length) {
        const auto = query.triggers.includes("auto")
        const manual = query.triggers.includes("manual")
        if (auto !== manual) and.push(manual ? { trigger: "manual" } : { trigger: { $ne: "manual" } })
    }

    const createdAt = createdAtRange(query.from, query.to)
    if (createdAt) filter.createdAt = createdAt

    return mergeAnd(filter, and)
}
