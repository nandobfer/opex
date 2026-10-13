import { Schema, model, models, type Model } from "mongoose"
import { auditPlugin } from "../plugins/audit.plugin"

/**
 * Metadados das imagens de um ambiente (`environment_images`). A imagem em si vive no Docker do
 * host; aqui guardamos o **id imutável** (`sha256:…`), a tag, a versão de banco lida no build, a
 * data e a origem (`opex` = publicada pelo Opex; `cd` = veio do pipeline; `unknown` = sem metadados).
 */

export interface IEnvironmentImage {
    environmentId: string
    projectId: string
    /** Id imutável da imagem no Docker. */
    imageId: string
    tag: string | null
    dbVersion: string | null
    builtAt: Date | null
    origin: "opex" | "cd" | "unknown"
    service: string | null
    commitSha: string | null
    createdBy: string
    createdAt: Date
    updatedBy: string
    updatedAt: Date
}

const EnvironmentImageSchema = new Schema<IEnvironmentImage>(
    {
        environmentId: { type: String, required: true, index: true },
        projectId: { type: String, required: true },
        imageId: { type: String, required: true },
        tag: { type: String, default: null },
        dbVersion: { type: String, default: null },
        builtAt: { type: Date, default: null },
        origin: { type: String, enum: ["opex", "cd", "unknown"], default: "opex" },
        service: { type: String, default: null },
        commitSha: { type: String, default: null },
    },
    { collection: "environment_images", versionKey: false },
)

EnvironmentImageSchema.index({ environmentId: 1, imageId: 1 }, { unique: true })

EnvironmentImageSchema.plugin(auditPlugin)

if (process.env.NODE_ENV === "development") {
    delete models.EnvironmentImage
}

export const EnvironmentImage: Model<IEnvironmentImage> =
    (models.EnvironmentImage as Model<IEnvironmentImage>) || model<IEnvironmentImage>("EnvironmentImage", EnvironmentImageSchema)
