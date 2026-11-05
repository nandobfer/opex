/**
 * Status dos agentes rotineiros e das execuções (OPE-130, módulo PURO). **Executando** e **Esperando**
 * ocupam vaga no limite de simultâneas; **Hibernada** e **Aguardando confirmação** não ocupam.
 */

export const ROUTINE_AGENT_STATUSES = ["active", "paused", "archived"] as const
export type RoutineAgentStatus = (typeof ROUTINE_AGENT_STATUSES)[number]
export const ROUTINE_AGENT_STATUS_LABELS: Record<RoutineAgentStatus, string> = { active: "Ativo", paused: "Pausado", archived: "Arquivado" }

export const ROUTINE_PROVISIONING_STATUSES = ["pending", "running", "ok", "error"] as const
export type RoutineProvisioningStatus = (typeof ROUTINE_PROVISIONING_STATUSES)[number]
export const ROUTINE_PROVISIONING_LABELS: Record<RoutineProvisioningStatus, string> = {
    pending: "Provisionamento pendente",
    running: "Provisionando",
    ok: "Provisionado",
    error: "Provisionamento com erro",
}

export const ROUTINE_RUN_STATUSES = ["queued", "running", "waiting", "hibernating", "awaiting_confirmation", "completed", "error", "canceled", "expired"] as const
export type RoutineRunStatus = (typeof ROUTINE_RUN_STATUSES)[number]

export const ROUTINE_RUN_STATUS_LABELS: Record<RoutineRunStatus, string> = {
    queued: "Na fila",
    running: "Executando",
    waiting: "Esperando",
    hibernating: "Hibernada",
    awaiting_confirmation: "Aguardando confirmação",
    completed: "Concluída",
    error: "Erro",
    canceled: "Cancelada",
    expired: "Expirada",
}

/** Turno vivo: ocupa vaga e conta no tempo máximo ativo (decisão D3 da OPE-130). */
export const ROUTINE_SLOT_STATUSES: readonly RoutineRunStatus[] = ["running", "waiting"]
/** Turno encerrado à espera: conta no tempo máximo total esperando. */
export const ROUTINE_PARKED_STATUSES: readonly RoutineRunStatus[] = ["hibernating", "awaiting_confirmation"]
export const ROUTINE_FINAL_STATUSES: readonly RoutineRunStatus[] = ["completed", "error", "canceled", "expired"]

export const isFinalRunStatus = (status: RoutineRunStatus) => ROUTINE_FINAL_STATUSES.includes(status)
export const occupiesSlot = (status: RoutineRunStatus) => ROUTINE_SLOT_STATUSES.includes(status)
export const isParkedStatus = (status: RoutineRunStatus) => ROUTINE_PARKED_STATUSES.includes(status)
/** Cancelar existe em todos os status não finais. */
export const canCancelRun = (status: RoutineRunStatus) => !isFinalRunStatus(status)

export const ROUTINE_TRIGGER_KINDS = ["manual", "schedule", "once", "webhook", "opex-agent"] as const
export type RoutineTriggerOrigin = (typeof ROUTINE_TRIGGER_KINDS)[number]
export const ROUTINE_TRIGGER_ORIGIN_LABELS: Record<RoutineTriggerOrigin, string> = {
    manual: "Manual",
    schedule: "Agendado recorrente",
    once: "Agendado único",
    webhook: "Webhook",
    "opex-agent": "Agente Opex",
}
