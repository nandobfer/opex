import type { ProjectRef } from "@/features/tasks/types"

/**
 * Contratos do módulo **Serviços** (lançamento manual de faturamento). Módulo puro (cliente e
 * servidor): o servidor monta o DTO a partir do documento e o cliente só o desenha.
 */

export type ServiceAiStatus = "pending" | "done" | "error"

/** Tag da taxonomia já resolvida para exibição (id + rótulo). */
export interface ServiceTagView {
    id: string
    label: string
}

/** Tarefa vinculada (referência opcional). `exists: false` quando a tarefa foi excluída depois. */
export interface ServiceTaskRef {
    id: string
    code: string
    title: string
    exists: boolean
}

/** Serviço como o dono o vê (lista, detalhe e formulário). */
export interface ServiceDto {
    id: string
    code: string
    clientId: string
    /** Nome do cliente; `null` quando o registro do cliente não existe mais. */
    clientName: string | null
    project: ProjectRef | null
    task: ServiceTaskRef | null
    description: string
    title: string | null
    summary: string | null
    tags: ServiceTagView[]
    /** Data do serviço (ISO, meia-noite UTC do dia escolhido). */
    serviceDate: string
    /** Duração real (H). */
    hours: number
    /** Duração inflada (H × fator). */
    clientHours: number
    /** Faturamento (R$). */
    billingBrl: number
    /** Snapshot do fator de lucro aplicado. */
    factor: number
    /** Snapshot do custo por hora aplicado. */
    hourlyRate: number
    aiStatus: ServiceAiStatus
    aiError: string | null
    archived: boolean
    /** Anexos confirmados do serviço. */
    attachmentsCount: number
    createdAt: string | null
    updatedAt: string | null
}

/** Payload mínimo do evento `services-updated`. */
export interface ServicesUpdatedEvent {
    ids: string[]
}
