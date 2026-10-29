import type { PrReviewListQuery } from "../schemas"

/** Filtro do Mongo da lista do Agente Revisor (função pura: `GET /api/pr-reviews`). */

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

type ListFilterInput = Pick<PrReviewListQuery, "q" | "states" | "verdicts" | "repos" | "triggers"> & { from?: string; to?: string }

export function buildPrReviewListFilter(query: ListFilterInput): Record<string, unknown> {
    const filter: Record<string, unknown> = {}
    const and: Record<string, unknown>[] = []

    const q = query.q.trim()
    if (q) {
        const pattern = { $regex: escapeRegex(q), $options: "i" }
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

    const createdAt: Record<string, Date> = {}
    if (query.from) createdAt.$gte = new Date(query.from)
    if (query.to) createdAt.$lte = new Date(query.to)
    if (Object.keys(createdAt).length) filter.createdAt = createdAt

    if (and.length === 1) Object.assign(filter, and[0])
    else if (and.length > 1) filter.$and = and
    return filter
}
