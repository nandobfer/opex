import { Schema, model, models, type Model } from "mongoose"

/**
 * Apontamentos de horas dO Opex — **controle de horas agêntico** (o Opex é a fonte de verdade).
 * Cada apontamento é um **período ativo de uma mesa de trabalho**: começa quando o agente começa a
 * trabalhar, fecha quando ele para (esperando o usuário) e é retomado no período seguinte. Guarda
 * ainda o agente/modelo da etapa e o uso (tokens e custo) acumulado no período. Vários apontamentos
 * podem ficar ativos ao mesmo tempo (um por mesa).
 */

export interface ITimeLog {
    taskId: string
    /** Mesa de trabalho que originou o período (`null` em apontamentos legados/manuais). */
    workbenchId: string | null
    /** Etapa do desenvolvimento agêntico quando o período começou. */
    stage: string | null
    /** Agente do OpenCode que trabalhou no período. */
    agent: string | null
    /** Modelo do OpenCode (`provedor/modelo`) usado no período. */
    model: string | null
    startTime: Date
    endTime: Date | null
    /** Minutos. */
    duration: number | null
    /** Custo em dólares acumulado no período. */
    costUsd: number
    inputTokens: number
    outputTokens: number
    reasoningTokens: number
    description: string | null
    active: boolean
    createdAt: Date
}

const TimeLogSchema = new Schema<ITimeLog>(
    {
        taskId: { type: String, required: true, index: true },
        workbenchId: { type: String, default: null, index: true },
        stage: { type: String, default: null },
        agent: { type: String, default: null },
        model: { type: String, default: null },
        startTime: { type: Date, required: true },
        endTime: { type: Date, default: null },
        duration: { type: Number, default: null },
        costUsd: { type: Number, default: 0 },
        inputTokens: { type: Number, default: 0 },
        outputTokens: { type: Number, default: 0 },
        reasoningTokens: { type: Number, default: 0 },
        description: { type: String, default: null },
        active: { type: Boolean, default: true, index: true },
        createdAt: { type: Date, default: () => new Date() },
    },
    { collection: "time_logs", versionKey: false },
)

// Um período ativo por mesa (as consultas de período em aberto usam esta combinação).
TimeLogSchema.index({ workbenchId: 1, active: 1 })

if (process.env.NODE_ENV === "development") {
    delete models.TimeLog
}

export const TimeLog: Model<ITimeLog> = (models.TimeLog as Model<ITimeLog>) || model<ITimeLog>("TimeLog", TimeLogSchema)
