import { Schema, model, models, type Model } from "mongoose"
import type { AgentResult } from "@/features/environments/schemas"
import { environmentImageFields } from "./environment-fields"
export interface IEnvironmentImage {
    environmentId: string
    operationId: string
    images: AgentResult["images"]
    dbVersion: string | null
    version: string
    builtAt: Date | null
    origin: string
}
const schema = new Schema<IEnvironmentImage>(
    {
        environmentId: { type: String, required: true, index: true },
        operationId: { type: String, required: true, unique: true },
        images: { type: [environmentImageFields], required: true },
        dbVersion: { type: String, default: null },
        version: { type: String, required: true },
        builtAt: { type: Date, default: null },
        origin: { type: String, enum: ["opex", "cd", "external"], required: true },
    },
    { collection: "environment_images" },
)
export const EnvironmentImage: Model<IEnvironmentImage> =
    (models.EnvironmentImage as Model<IEnvironmentImage>) || model<IEnvironmentImage>("EnvironmentImage", schema)
