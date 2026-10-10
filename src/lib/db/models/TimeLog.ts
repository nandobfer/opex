import { Schema, model, models, type Model } from "mongoose"

/**
 * Apontamentos de horas dO Opex (o Opex é a fonte de verdade). Um timer ativo por vez no app
 * (`active: true`); `duration` em minutos é gravada ao parar.
 */

export interface ITimeLog {
    taskId: string
    startTime: Date
    endTime: Date | null
    /** Minutos. */
    duration: number | null
    description: string | null
    active: boolean
    createdAt: Date
}

const TimeLogSchema = new Schema<ITimeLog>(
    {
        taskId: { type: String, required: true, index: true },
        startTime: { type: Date, required: true },
        endTime: { type: Date, default: null },
        duration: { type: Number, default: null },
        description: { type: String, default: null },
        active: { type: Boolean, default: true, index: true },
        createdAt: { type: Date, default: () => new Date() },
    },
    { collection: "time_logs", versionKey: false },
)

if (process.env.NODE_ENV === "development") {
    delete models.TimeLog
}

export const TimeLog: Model<ITimeLog> = (models.TimeLog as Model<ITimeLog>) || model<ITimeLog>("TimeLog", TimeLogSchema)
