import mongoose, { Schema, type InferSchemaType, type Model, type Types } from "mongoose"
import { auditPlugin } from "../plugins/audit.plugin"

/**
 * Token de sistema da API interna (Integrações › API interna). Guarda só o HASH (SHA-256) — o
 * valor aparece uma única vez, ao gerar — e o prefixo visível para reconhecer o token na tela.
 * Revogado não volta.
 */
const apiTokenSchema = new Schema(
    {
        nome: { type: String, trim: true, required: true, maxlength: 60 },
        prefixo: { type: String, required: true },
        hash: { type: String, required: true },
        ultimoUsoEm: { type: Date, default: null },
        revogadoEm: { type: Date, default: null },
    },
    { collection: "api_tokens" },
)

apiTokenSchema.plugin(auditPlugin)
apiTokenSchema.index({ revogadoEm: 1, createdAt: -1 })
apiTokenSchema.index({ hash: 1 }, { unique: true })

export type IApiToken = InferSchemaType<typeof apiTokenSchema> & { _id: Types.ObjectId; createdAt?: Date }

export const ApiToken: Model<IApiToken> = (mongoose.models.ApiToken as Model<IApiToken>) || mongoose.model<IApiToken>("ApiToken", apiTokenSchema)
