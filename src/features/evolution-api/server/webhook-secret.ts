import { randomBytes } from "node:crypto"
import { DomainError } from "@/lib/api/route"
import { encryptSecret } from "@/lib/crypto/secretBox"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { Integration } from "@/lib/db/models/Integration"
import { getIntegrationConfig } from "@/lib/integrations/config"
import { invalidateStoredIntegrations } from "@/lib/integrations/store"
import { EVOLUTION_INTEGRATION_ID } from "../constants"

let inFlight: Promise<string> | null = null

/**
 * Garante o segredo do webhook (gerado no servidor, cifrado; nunca exibido). A gravação é CONDICIONAL: só grava
 * se o segredo ainda não existe no banco e, em seguida, relê o valor vencedor. Duas chamadas ao mesmo tempo (neste
 * processo ou em outra instância do app, como uma prévia no mesmo banco) terminam com um único segredo, o mesmo que
 * vai para a Evolution.
 */
export function ensureWebhookSecret(actorId: string): Promise<string> {
    inFlight ??= createOnce(actorId).finally(() => {
        inFlight = null
    })
    return inFlight
}

async function createOnce(actorId: string): Promise<string> {
    const config = await getIntegrationConfig(EVOLUTION_INTEGRATION_ID)
    if (config.webhookSecret) return config.webhookSecret
    await dbConnect()
    // Materializa o documento da integração se ainda não existe (sem sobrescrever o que já foi salvo).
    await Integration.updateOne(
        { integrationId: EVOLUTION_INTEGRATION_ID },
        { $setOnInsert: { integrationId: EVOLUTION_INTEGRATION_ID, environment: "interno", debugMode: false, publicValues: {}, secretValues: {} } },
        { upsert: true },
    )
    const box = encryptSecret(randomBytes(32).toString("base64url"))
    const result = await Integration.updateOne(
        { integrationId: EVOLUTION_INTEGRATION_ID, $or: [{ "secretValues.webhookSecret": { $exists: false } }, { "secretValues.webhookSecret": null }] },
        { $set: { "secretValues.webhookSecret": box }, _auditContext: { userId: actorId } },
    )
    invalidateStoredIntegrations()
    if (result.modifiedCount > 0) {
        await recordAudit({ userId: actorId, entidade: "EvolutionApi", entidadeId: EVOLUTION_INTEGRATION_ID, acao: AcaoAuditoria.ATUALIZAR, depois: { webhookSecret: "(gerado)" } })
    }
    const winner = (await getIntegrationConfig(EVOLUTION_INTEGRATION_ID)).webhookSecret
    if (!winner) throw new DomainError(500, "Não foi possível gravar o segredo do webhook", "EVOLUTION_WEBHOOK_SECRET")
    return winner
}
