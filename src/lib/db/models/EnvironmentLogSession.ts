import { Schema, model, models, type Model } from "mongoose"
export interface IEnvironmentLogSession {
    environmentId: string
    viewers: { id: string; actorId: string; expiresAt: Date }[]
    sessionId: string | null
    accessPath: string | null
    state: string
    heartbeatAt: Date | null
}
const schema = new Schema<IEnvironmentLogSession>(
    {
        environmentId: { type: String, unique: true, required: true },
        viewers: { type: [{ _id: false, id: String, actorId: String, expiresAt: Date }], default: [] },
        sessionId: { type: String, default: null },
        accessPath: { type: String, default: null, select: false },
        state: { type: String, default: "idle" },
        heartbeatAt: { type: Date, default: null },
    },
    { collection: "environment_log_sessions" },
)
export const EnvironmentLogSession: Model<IEnvironmentLogSession> =
    (models.EnvironmentLogSession as Model<IEnvironmentLogSession>) ||
    model<IEnvironmentLogSession>("EnvironmentLogSession", schema)
