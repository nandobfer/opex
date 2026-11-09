import { dbConnect, recordAudit, AcaoAuditoria, createAuditContext } from "@/lib/db"
import { Integration } from "@/lib/db/models/Integration"
import { DomainError } from "@/lib/api/route"
import { runAfterResponse } from "@/lib/after-response"
import { encryptSecret, SecretBoxKeyError, type EncryptedSecret } from "@/lib/crypto/secretBox"
import { getIntegrationDef } from "@/lib/integrations/catalog"
import { newApiKeyId } from "@/lib/integrations/key-ring"
import { invalidateStoredIntegrations, type StoredApiKey } from "@/lib/integrations/store"
import { getAiProvider } from "@/lib/ai/providers"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import {
    AI_PROVIDER_KEYS_UPDATED_EVENT,
    createAiApiKeySchema,
    updateAiApiKeySchema,
    type AiApiKeyDto,
    isAiApiKeyProviderId,
    type AiApiKeyProviderId,
} from "../api-keys"

/**
 * Chaveiro dos provedores de IA (OPE-155) — SOMENTE servidor. As chaves ficam no documento da
 * integração (`integration_configs.apiKeys` + `activeApiKeyId`): uma ativa por construção. É o ÚNICO
 * caminho de gravação da API key desses provedores (o PATCH genérico de integrações a recusa).
 *
 * Quando a chave **efetiva** muda (ativar, substituir o segredo da ativa, primeira chave, remover a
 * ativa), limpa os caches, testa o provedor de novo e reenvia a chave ao Engramind depois da resposta.
 */

const log = loggerFor({ module: "ai", feature: "api-keys" })
export const AI_API_KEY_AUDIT_ENTITY = "ChaveApiIA"

interface KeyRingDoc {
    apiKeys?: StoredApiKey[]
    activeApiKeyId?: string | null
}

/** Provedor da rota com chaveiro; os demais (OpenCode, desconhecidos) respondem 404. */
export function keyRingProvider(provider: string): AiApiKeyProviderId {
    if (!isAiApiKeyProviderId(provider)) throw new DomainError(404, "Este provedor não usa chaves de API", "AI_PROVIDER_NOT_FOUND")
    return provider
}

function integrationOf(provider: AiApiKeyProviderId) {
    return getAiProvider(provider).integrationId
}

async function loadKeyRing(provider: AiApiKeyProviderId): Promise<KeyRingDoc | null> {
    await dbConnect()
    return (await Integration.findOne({ integrationId: integrationOf(provider) }).select({ apiKeys: 1, activeApiKeyId: 1 }).lean()) as KeyRingDoc | null
}

function toDto(item: StoredApiKey, activeId: string | null | undefined): AiApiKeyDto {
    return {
        id: item.id,
        name: item.name,
        active: item.id === activeId,
        createdAt: new Date(item.createdAt).toISOString(),
        updatedAt: new Date(item.updatedAt).toISOString(),
    }
}

/** Chaves do provedor (a ativa primeiro; as demais da mais nova para a mais antiga). Nunca devolve o segredo. */
export async function listAiApiKeys(provider: AiApiKeyProviderId): Promise<AiApiKeyDto[]> {
    const doc = await loadKeyRing(provider)
    const active = doc?.activeApiKeyId ?? null
    return (doc?.apiKeys ?? [])
        .map((item) => toDto(item, active))
        .sort((a, b) => Number(b.active) - Number(a.active) || b.createdAt.localeCompare(a.createdAt))
}

function encrypt(secret: string): EncryptedSecret {
    try {
        return encryptSecret(secret)
    } catch (error) {
        if (error instanceof SecretBoxKeyError) throw new DomainError(409, "Não é possível salvar a chave: configure INTEGRATIONS_ENCRYPTION_KEY no servidor", "SECRET_BOX_KEY_MISSING")
        throw error
    }
}

function findKey(doc: KeyRingDoc | null, keyId: string): StoredApiKey {
    const item = doc?.apiKeys?.find((candidate) => candidate.id === keyId)
    if (!item) throw new DomainError(404, "Chave de API não encontrada", "AI_API_KEY_NOT_FOUND")
    return item
}

function assertUniqueName(doc: KeyRingDoc | null, name: string, ignoreId?: string): void {
    const taken = doc?.apiKeys?.some((item) => item.id !== ignoreId && item.name.trim().toLowerCase() === name.trim().toLowerCase())
    if (taken) throw new DomainError(409, "Já existe uma chave com este nome neste provedor", "AI_API_KEY_NAME_TAKEN")
}

/** Garante o documento da integração (primeira chave sem nenhum salvamento anterior). */
async function ensureIntegrationDoc(provider: AiApiKeyProviderId, actorId: string): Promise<void> {
    const integrationId = integrationOf(provider)
    if (await Integration.exists({ integrationId })) return
    const def = getIntegrationDef(integrationId)
    const doc = new Integration({ integrationId, environment: def.defaultEnvironment, debugMode: false, publicValues: {}, secretValues: {} })
    doc.set("_auditContext", createAuditContext(actorId))
    await doc.save()
}

/** Efeitos da troca da chave efetiva: caches, novo teste do provedor e cópia no Engramind. */
async function afterEffectiveKeyChange(provider: AiApiKeyProviderId, hasActive: boolean): Promise<void> {
    const integrationId = integrationOf(provider)
    const [{ clearAiCatalogCache }, { resetAiConnectionProbes }] = await Promise.all([import("@/lib/ai/catalog"), import("@/lib/ai/connection")])
    clearAiCatalogCache()
    resetAiConnectionProbes()
    runAfterResponse("ai-api-key-effects", async () => {
        if (hasActive) {
            const { runIntegrationTest } = await import("@/features/integrations/services/integration-test-runner")
            await runIntegrationTest(integrationId, { source: "scheduler" }).catch((error: unknown) => log.warn({ err: error, integrationId }, "[ai] falha ao testar o provedor com a nova chave"))
        }
        // O JEV não alimenta o Engramind (a "IA do Opex" usa só provedores de texto e embedding).
        if (provider !== "jev") {
            const { syncEngramindProviderKey } = await import("@/features/engramind/server/ai-source")
            await syncEngramindProviderKey(integrationId)
        }
    })
}

async function finish(provider: AiApiKeyProviderId, actorId: string, keyId: string, acao: (typeof AcaoAuditoria)[keyof typeof AcaoAuditoria], antes: Record<string, unknown> | undefined, depois: Record<string, unknown> | undefined, effective: { changed: boolean; hasActive: boolean }): Promise<AiApiKeyDto[]> {
    invalidateStoredIntegrations()
    await recordAudit({ userId: actorId, entidade: AI_API_KEY_AUDIT_ENTITY, entidadeId: `${provider}:${keyId}`, acao, antes, depois })
    log.info({ provider, keyId, acao, effectiveChanged: effective.changed }, "[ai] chaveiro do provedor alterado")
    if (effective.changed) await afterEffectiveKeyChange(provider, effective.hasActive)
    await publishAppEvent(AI_PROVIDER_KEYS_UPDATED_EVENT, { provider })
    return listAiApiKeys(provider)
}

/** Nova chave. A primeira do provedor (ou sem nenhuma ativa) já entra ativa. */
export async function createAiApiKey(provider: AiApiKeyProviderId, raw: unknown, actorId: string): Promise<AiApiKeyDto[]> {
    const input = createAiApiKeySchema.parse(raw)
    const doc = await loadKeyRing(provider)
    assertUniqueName(doc, input.name)
    const secret = encrypt(input.secret)
    await ensureIntegrationDoc(provider, actorId)
    const now = new Date()
    const item: StoredApiKey = { id: newApiKeyId(), name: input.name, secret, createdAt: now, updatedAt: now, createdBy: actorId }
    const activate = !doc?.activeApiKeyId || !doc.apiKeys?.some((candidate) => candidate.id === doc.activeApiKeyId)
    await Integration.updateOne(
        { integrationId: integrationOf(provider) },
        { $push: { apiKeys: item }, ...(activate ? { $set: { activeApiKeyId: item.id } } : {}), _auditContext: { userId: actorId } },
    )
    return finish(provider, actorId, item.id, AcaoAuditoria.CRIAR, undefined, { provider, name: item.name, active: activate, secret: "(definido)" }, { changed: activate, hasActive: true })
}

/** Renomear e/ou substituir o segredo (mantém o id: o consumo continua agrupado na chave). */
export async function updateAiApiKey(provider: AiApiKeyProviderId, keyId: string, raw: unknown, actorId: string): Promise<AiApiKeyDto[]> {
    const input = updateAiApiKeySchema.parse(raw)
    const doc = await loadKeyRing(provider)
    const current = findKey(doc, keyId)
    const $set: Record<string, unknown> = { "apiKeys.$.updatedAt": new Date() }
    const antes: Record<string, unknown> = {}
    const depois: Record<string, unknown> = {}
    if (input.name !== undefined && input.name !== current.name) {
        assertUniqueName(doc, input.name, keyId)
        $set["apiKeys.$.name"] = input.name
        antes.name = current.name
        depois.name = input.name
    }
    if (input.secret !== undefined) {
        $set["apiKeys.$.secret"] = encrypt(input.secret)
        antes.secret = "(definido)"
        depois.secret = "(substituído)"
    }
    if (Object.keys(depois).length === 0) return listAiApiKeys(provider)
    await Integration.updateOne({ integrationId: integrationOf(provider), "apiKeys.id": keyId }, { $set, _auditContext: { userId: actorId } })
    const isActive = doc?.activeApiKeyId === keyId
    return finish(provider, actorId, keyId, AcaoAuditoria.ATUALIZAR, { provider, ...antes }, { provider, ...depois }, { changed: isActive && input.secret !== undefined, hasActive: true })
}

/** Marca a chave como a ativa do provedor (só uma por vez). */
export async function activateAiApiKey(provider: AiApiKeyProviderId, keyId: string, actorId: string): Promise<AiApiKeyDto[]> {
    const doc = await loadKeyRing(provider)
    const item = findKey(doc, keyId)
    if (doc?.activeApiKeyId === keyId) return listAiApiKeys(provider)
    const previous = doc?.apiKeys?.find((candidate) => candidate.id === doc.activeApiKeyId)
    await Integration.updateOne({ integrationId: integrationOf(provider), "apiKeys.id": keyId }, { $set: { activeApiKeyId: keyId }, _auditContext: { userId: actorId } })
    return finish(provider, actorId, keyId, AcaoAuditoria.ATUALIZAR, { provider, ativa: previous?.name ?? null }, { provider, ativa: item.name }, { changed: true, hasActive: true })
}

/**
 * Remove a chave. A ativa só sai quando é a ÚNICA do provedor (o provedor fica "Não configurado");
 * com outras chaves, é preciso ativar outra antes.
 */
export async function removeAiApiKey(provider: AiApiKeyProviderId, keyId: string, actorId: string): Promise<AiApiKeyDto[]> {
    const doc = await loadKeyRing(provider)
    const item = findKey(doc, keyId)
    const isActive = doc?.activeApiKeyId === keyId
    if (isActive && (doc?.apiKeys?.length ?? 0) > 1) throw new DomainError(409, "Esta é a chave em uso: ative outra chave antes de removê-la", "AI_API_KEY_ACTIVE")
    await Integration.updateOne(
        { integrationId: integrationOf(provider) },
        { $pull: { apiKeys: { id: keyId } }, ...(isActive ? { $set: { activeApiKeyId: null } } : {}), _auditContext: { userId: actorId } },
    )
    return finish(provider, actorId, keyId, AcaoAuditoria.EXCLUIR, { provider, name: item.name, active: isActive }, undefined, { changed: isActive, hasActive: false })
}
