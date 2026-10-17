import { Schema, model, models, type Model } from "mongoose"
import type { AgentResult, EnvironmentInput } from "@/features/environments/schemas"
import type { EncryptedSecret } from "@/lib/crypto/secretBox"
import { environmentComposeFields } from "./environment-fields"

export interface IEnvironment {
    projectId: string
    slug: string
    config: EnvironmentInput
    secretVariables: EncryptedSecret | null
    revision: number
    dbVersion: string | null
    observedAt: Date | null
    compose: AgentResult["compose"]
    activeOperationId: string | null
    createdBy: string
    updatedBy: string
    createdAt: Date
    updatedAt: Date
}
const schema = new Schema<IEnvironment>(
    {
        projectId: { type: String, required: true, index: true },
        slug: { type: String, required: true },
        config: { type: Schema.Types.Mixed, required: true },
        secretVariables: { type: Schema.Types.Mixed, select: false, default: null },
        revision: { type: Number, default: 0 },
        dbVersion: { type: String, default: null },
        observedAt: { type: Date, default: null },
        compose: { type: [environmentComposeFields], default: [] },
        activeOperationId: { type: String, default: null },
        createdBy: { type: String, required: true },
        updatedBy: { type: String, required: true },
    },
    { collection: "environments", timestamps: true },
)
schema.index({ projectId: 1, slug: 1 }, { unique: true })
export const Environment: Model<IEnvironment> =
    (models.Environment as Model<IEnvironment>) || model<IEnvironment>("Environment", schema)
