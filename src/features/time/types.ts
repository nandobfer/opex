/** Apontamento de horas dO Opex (controle de horas agêntico — período ativo de uma mesa). */
export interface TimeLogDto {
    id: string
    taskId: string
    /** Mesa de trabalho que originou o período (`null` em apontamentos legados). */
    workbenchId: string | null
    /** Código da tarefa (ex.: `OPX-12`), lido do quadro local. */
    taskCode: string | null
    taskTitle: string | null
    /** Etapa do desenvolvimento agêntico quando o período começou. */
    stage: string | null
    /** Agente/modelo do OpenCode que trabalhou no período. */
    agent: string | null
    model: string | null
    startTime: string
    endTime: string | null
    /** Minutos (só depois de fechar). */
    duration: number | null
    /** Uso acumulado no período. */
    costUsd: number
    inputTokens: number
    outputTokens: number
    reasoningTokens: number
    description: string | null
    active: boolean
}

export interface TimeLogPageDto {
    logs: TimeLogDto[]
    page: number
    totalPages: number
    total: number
    /** Minutos de todo o período (todas as páginas). */
    totalMinutes: number
    /** Custo em dólares de todo o período (todas as páginas). */
    totalCostUsd: number
}

/** Payload do evento `time-updated` (canal `private-app`). */
export interface TimeUpdatedEvent {
    taskIds: string[]
}
