/**
 * Versão do plano que o diagrama segue (módulo PURO): o plano mais recente da mesa, em qualquer etapa
 * (inclusive "Plano em revisão", sem aprovação). O diagrama CONSOLIDA todos os planos até essa versão
 * (plano v6 da OPE-105): o plano é a fonte, a aprovação (Implementar) é só a reserva do disparo.
 */
export interface PlanVersionSource {
    plans: readonly unknown[]
}

export function diagramPlanVersionOf(doc: PlanVersionSource): number | null {
    return doc.plans.length || null
}
