/** Apontamento de horas do Go! Sipal (timer), normalizado. Nada disso fica nO Opex. */
export interface TimeLogDto {
    id: string
    /** `null` = timer sem tarefa (iniciado assim no Go! Sipal). */
    taskId: string | null
    /** Código da tarefa (ex.: `GO-DEV-12`), completado pelo quadro; `null` se não achou. */
    taskCode: string | null
    taskTitle: string | null
    productName: string | null
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
