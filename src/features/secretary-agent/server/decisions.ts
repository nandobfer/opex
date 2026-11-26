import { createdAtRange, pageInfo } from "@/lib/list/query"
import type { DecisionListQuery } from "../schemas"
import type { DecisionPageDto, DecisionRowDto } from "../types"
import { SecretaryDecisionRecord, secretaryDb } from "./models"

/** Aba Decisões (OPE-197): registro paginado no recorte de conversas, decisões e período, mais recentes primeiro. */
export async function listSecretaryDecisions(query: DecisionListQuery): Promise<DecisionPageDto> {
    await secretaryDb()
    const filter: Record<string, unknown> = {}
    if (query.jid.length) filter.jid = { $in: query.jid }
    if (query.decision.length) filter.decision = { $in: query.decision }
    const at = createdAtRange(query.from, query.to)
    if (at) filter.at = at
    const [rows, total] = await Promise.all([
        SecretaryDecisionRecord.find(filter).sort({ at: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).select("jid decision reason at").lean(),
        SecretaryDecisionRecord.countDocuments(filter),
    ])
    const items: DecisionRowDto[] = rows.map((row) => ({ _id: row._id, jid: row.jid, decision: row.decision, reason: row.reason, at: new Date(row.at).toISOString() }))
    return { items, ...pageInfo(query.page, query.limit, total) }
}
