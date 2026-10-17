import { Schema, model, models, type Model } from "mongoose"
import type { AgentResult } from "@/features/environments/schemas"
import { environmentImageFields } from "./environment-fields"
export interface IEnvironmentDeployment {
    environmentId: string
    operationId: string
    previousDbVersion: string | null
    dbVersion: string | null
    migrations: string[]
    evidence: string[]
    images: AgentResult["images"]
    result: string
    createdAt: Date
    updatedAt: Date
}
const schema = new Schema<IEnvironmentDeployment>(
    {
        environmentId: { type: String, required: true, index: true },
        operationId: { type: String, required: true, unique: true },
        previousDbVersion: { type: String, default: null },
        dbVersion: { type: String, default: null },
        migrations: { type: [String], default: [] },
        evidence: { type: [String], default: [] },
        images: { type: [environmentImageFields], default: [] },
        result: { type: String, required: true },
    },
    { collection: "environment_deployments", timestamps: true },
)
export const EnvironmentDeployment: Model<IEnvironmentDeployment> =
    (models.EnvironmentDeployment as Model<IEnvironmentDeployment>) ||
    model<IEnvironmentDeployment>("EnvironmentDeployment", schema)
