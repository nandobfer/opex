/** Apontamento de horas dO Opex (timer local). */
export interface TimeLogDto {
    id: string
    taskId: string
    /** Código da tarefa (ex.: `OPX-12`), lido do quadro local. */
    taskCode: string | null
    taskTitle: string | null
    startTime: string
    endTime: string | null
    /** Minutos (só depois de parar). */
    duration: number | null
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
}

/** Payload do evento `time-updated` (canal `private-app`). */
export interface TimeUpdatedEvent {
    taskIds: string[]
}
