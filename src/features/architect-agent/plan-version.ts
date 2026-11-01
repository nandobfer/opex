/**
 * Versão do plano aprovado de uma mesa (módulo PURO). A aprovação (botão Implementar) grava
 * `approvedPlanVersion`; mesas anteriores ao Agente Arquiteto derivam a versão do estado: fora do
 * planejamento, o último plano foi aprovado; no planejamento depois de uma implementação (o worktree
 * já existe), o aprovado é o anterior ao plano em revisão.
 */
export interface PlanVersionSource {
    approvedPlanVersion?: number | null
    stage: string
    plans: readonly unknown[]
    branch: string | null
}

export function approvedPlanVersionOf(doc: PlanVersionSource): number | null {
    if (typeof doc.approvedPlanVersion === "number" && doc.approvedPlanVersion > 0) return Math.min(doc.approvedPlanVersion, doc.plans.length) || null
    const count = doc.plans.length
    if (!count) return null
    if (doc.stage === "planning") return doc.branch ? count : null
    if (doc.stage === "plan_review") return doc.branch && count > 1 ? count - 1 : null
    return count
}
