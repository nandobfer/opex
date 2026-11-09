import { Schema, model, models, type Document, type Model } from "mongoose"
import { auditPlugin } from "../plugins/audit.plugin"
import type { EncryptedSecret } from "@/lib/crypto/secretBox"
import type { IntegrationEnvironment, PublicFieldValue } from "@/lib/integrations/catalog"

/**
 * Configuração persistida de uma integração. Um documento por `integrationId`.
 *
 * - `publicValues`: texto/número/booleano simples, visível e editável na tela.
 * - `secretValues`: segredos criptografados (AES-256-GCM, ver `secretBox`). `null` significa
 *   "limpo explicitamente pelo administrador" — distinto de chave ausente, que cai no `.env`.
 */
export interface IIntegration extends Document {
    integrationId: string
    environment: IntegrationEnvironment
    debugMode: boolean
    /** URL da documentação Swagger (OpenAPI 3.x). Opcional; fora dos campos públicos. */
    swaggerUrl?: string | null
    publicValues: Record<string, PublicFieldValue>
    secretValues: Record<string, EncryptedSecret | null>
    /** Chaveiro de chaves de API nomeadas (provedores de IA, OPE-155); segredo cifrado como `secretValues`. */
    apiKeys?: { id: string; name: string; secret: EncryptedSecret; createdAt: Date; updatedAt: Date; createdBy?: string }[]
    /** Chave do chaveiro em uso (`null` = nenhuma). */
    activeApiKeyId?: string | null
    createdBy: string
    createdAt: Date
    updatedBy: string
    updatedAt: Date
}

const IntegrationSchema = new Schema(
    {
        integrationId: { type: String, required: true, unique: true, index: true },
        environment: { type: String, enum: ["interno", "externo"], required: true },
        debugMode: { type: Boolean, default: false },
        swaggerUrl: { type: String, default: null },
        publicValues: { type: Schema.Types.Mixed, default: {} },
        secretValues: { type: Schema.Types.Mixed, default: {} },
        apiKeys: { type: [Schema.Types.Mixed], default: undefined },
        activeApiKeyId: { type: String, default: undefined },
    },
    { collection: "integration_configs", minimize: false },
)

IntegrationSchema.plugin(auditPlugin)

if (process.env.NODE_ENV === "development") {
    delete models.Integration
}

export const Integration: Model<IIntegration> =
    (models.Integration as Model<IIntegration>) || model<IIntegration>("Integration", IntegrationSchema)

export default Integration
