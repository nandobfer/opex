import { dbConnect } from "@/lib/db"
import { PrReview } from "@/lib/db/models/PrReview"
import { loadPrReviewSettings } from "@/features/ai/server/settings"
import { replanDecision } from "../logic"

/**
 * Regras da revisão automática aplicadas pelo `agentic-pr-watch` nas mesas: se um pedido de
 * mudanças da revisão pode replanejar a mesa (limite configurável) e se o merge automático deve
 * esperar a revisão do commit atual.
 */
/** Revisão automática do commit atual do PR (`enabled: false` = revisão automática desligada; `state: null` = ainda não revisado). */
export type PrReviewStatus = { enabled: false } | { enabled: true; state: string | null; verdict: string | null }

export interface PrReviewGate {
    replan(count: number): { allowed: boolean; reason: string | null }
    blocksAutoMerge(repo: string, number: number, headSha: string | null | undefined): Promise<boolean>
    reviewStatus(repo: string, number: number, headSha: string | null | undefined): Promise<PrReviewStatus>
}

export async function loadPrReviewGate(): Promise<PrReviewGate> {
    const { settings } = await loadPrReviewSettings()
    return {
        replan: (count) => replanDecision(settings, count),
        async blocksAutoMerge(repo, number, headSha) {
            if (!settings.enabled || !headSha) return false
            await dbConnect()
            const doc = await PrReview.findOne({ repo: repo.toLowerCase(), number, headSha }).select({ state: 1, verdict: 1, blocking: 1, error: 1 }).lean()
            if (!doc) return false
            // Na fila/revisando: espera. Revisão que pediu mudanças: o merge fica para depois da correção.
            return doc.state !== "done" || Boolean(doc.error) || doc.verdict === "changes_requested" || (doc.blocking ?? 0) > 0
        },
        async reviewStatus(repo, number, headSha) {
            if (!settings.enabled) return { enabled: false }
            if (!headSha) return { enabled: true, state: null, verdict: null }
            await dbConnect()
            const doc = await PrReview.findOne({ repo: repo.toLowerCase(), number, headSha }).select({ state: 1, verdict: 1 }).lean()
            return { enabled: true, state: doc?.state ?? null, verdict: doc?.verdict ?? null }
        },
    }
}
