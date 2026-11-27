import { dbConnect, recordAudit, AcaoAuditoria, createAuditContext } from "@/lib/db"
import { Integration } from "@/lib/db/models/Integration"
import { DomainError } from "@/lib/api/route"
import { runAfterResponse } from "@/lib/after-response"
import { encryptSecret, SecretBoxKeyError, type EncryptedSecret } from "@/lib/crypto/secretBox"
import { getIntegrationDef } from "@/lib/integrations/catalog"
import { activeApiKeyOf, selectedApiKeysOf } from "@/lib/integrations/config"
import { newApiKeyId } from "@/lib/integrations/key-ring"
import { invalidateStoredIntegrations, type StoredApiKey } from "@/lib/integrations/store"
import { getAiProvider } from "@/lib/ai/providers"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import { aiKeyBillingSchema, billingOf, type AiKeyBilling, type StoredAiKeyBilling } from "@/features/ai-billing/schemas"
import {
    AI_PROVIDER_KEYS_UPDATED_EVENT,
    aiApiKeySelectionSchema,
    createAiApiKeySchema,
    feedsEngramind,
    updateAiApiKeySchema,
    type AiApiKeyDto,
    hasKeyBilling,
    isAiApiKeyProviderId,
    type AiApiKeyProviderId,
} from "../api-keys"

/**
 * Chaveiro dos provedores de IA (OPE-155/OPE-179) — SOMENTE servidor. As chaves ficam no documento da
 * integração: `apiKeys`, a **principal** em `activeApiKeyId` (uma por construção; é o único campo que a
 * versão antiga lê) e as **em uso** (rodízio) em `selectedApiKeyIds`, lidas sempre por
 * `selectedApiKeysOf` (a principal entra mesmo fora da lista). É o ÚNICO caminho de gravação da API
 * key desses provedores (o PATCH genérico de integrações a recusa).
 *
 * Quando a **principal** muda (tornar principal, substituir o segredo dela, primeira chave, remover a
 * única), limpa os caches (inclusive o catálogo do Go), testa o provedor de novo e reenvia a chave ao
 * Engramind depois da resposta (só os provedores que o Engramind usa). Quando só o rodízio muda, o
 * provedor é testado de novo (conferência por chave), sem reenviar ao Engramind.
 */

const log = loggerFor({ module: "ai", feature: "api-keys" })

function stripSetAt(billing: StoredAiKeyBilling): AiKeyBilling {
    const plan: Partial<StoredAiKeyBilling> = { ...billing }
    delete plan.setAt
    return plan as AiKeyBilling
}
export const AI_API_KEY_AUDIT_ENTITY = "ChaveApiIA"

interface KeyRingDoc {
    apiKeys?: StoredApiKey[]
    activeApiKeyId?: string | null
    selectedApiKeyIds?: string[]
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
    return (await Integration.findOne({ integrationId: integrationOf(provider) }).select({ apiKeys: 1, activeApiKeyId: 1, selectedApiKeyIds: 1 }).lean()) as KeyRingDoc | null
}

/** Id da principal válida (existe no chaveiro) ou `null`. */
function primaryIdOf(doc: KeyRingDoc | null): string | null {
    return activeApiKeyOf(doc)?.id ?? null
}

/** Ids em uso, normalizados (com a principal, sem ids removidos). */
function selectedIdsOf(doc: KeyRingDoc | null): string[] {
    return selectedApiKeysOf(doc).map((item) => item.id)
}

function toDto(item: StoredApiKey, primaryId: string | null, selected: ReadonlySet<string>): AiApiKeyDto {
    return {
        id: item.id,
        name: item.name,
        active: selected.has(item.id),
        primary: item.id === primaryId,
        billing: stripSetAt(billingOf(item.billing)),
        billingNotices: [],
        createdAt: new Date(item.createdAt).toISOString(),
        updatedAt: new Date(item.updatedAt).toISOString(),
    }
}

/** Chaves do provedor (a principal primeiro, depois as em uso, as demais da mais nova para a mais antiga). Nunca devolve o segredo. */
export async function listAiApiKeys(provider: AiApiKeyProviderId): Promise<AiApiKeyDto[]> {
    const doc = await loadKeyRing(provider)
    const primaryId = primaryIdOf(doc)
    const selected = new Set(selectedIdsOf(doc))
    const keys = (doc?.apiKeys ?? []).map((item) => toDto(item, primaryId, selected))
    // Avisos do plano (OPE-203): falha na leitura não derruba a lista de chaves.
    if (hasKeyBilling(provider) && keys.some((key) => key.billing.mode !== "usage")) {
        const { keyBillingNotices } = await import("@/features/ai-billing/server/key-notices")
        const notices = await keyBillingNotices(provider, doc?.apiKeys ?? []).catch((error: unknown) => {
            log.warn({ provider, err: error instanceof Error ? error.message : String(error) }, "[ai] avisos dos planos de cobrança indisponíveis")
            return new Map<string, string[]>()
        })
        for (const key of keys) key.billingNotices = notices.get(key.id) ?? []
    }
    return keys.sort((a, b) => Number(b.primary) - Number(a.primary) || Number(b.active) - Number(a.active) || b.createdAt.localeCompare(a.createdAt))
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

interface KeyRingEffects {
    /** A principal mudou (ou o segredo dela): caches, novo teste e Engramind. */
    primaryChanged: boolean
    /** Só o rodízio mudou (ou o segredo de uma chave em uso): novo teste do provedor. */
    poolChanged: boolean
    /** Ainda há principal depois da ação (sem ela não há o que testar). */
    hasPrimary: boolean
}

/** Efeitos da troca: caches, novo teste do provedor e cópia da principal no Engramind. */
async function afterKeyRingChange(provider: AiApiKeyProviderId, effects: KeyRingEffects): Promise<void> {
    const integrationId = integrationOf(provider)
    if (effects.primaryChanged) {
        const [{ clearAiCatalogCache }, { resetAiConnectionProbes }] = await Promise.all([import("@/lib/ai/catalog"), import("@/lib/ai/connection")])
        clearAiCatalogCache()
        resetAiConnectionProbes()
        if (provider === "opencode-go") (await import("@/lib/ai/opencode-go")).clearOpencodeGoCatalogCache()
        if (provider === "command-code") (await import("@/lib/ai/command-code")).clearCommandCodeCatalogCache()
    }
    runAfterResponse("ai-api-key-effects", async () => {
        if (effects.hasPrimary) {
            const { runIntegrationTest } = await import("@/features/integrations/services/integration-test-runner")
            await runIntegrationTest(integrationId, { source: "scheduler" }).catch((error: unknown) => log.warn({ err: error, integrationId }, "[ai] falha ao testar o provedor com as chaves novas"))
        }
        if (effects.primaryChanged && feedsEngramind(provider)) {
            const { syncEngramindProviderKey } = await import("@/features/engramind/server/ai-source")
            await syncEngramindProviderKey(integrationId)
        }
    })
}

async function finish(provider: AiApiKeyProviderId, actorId: string, keyId: string, acao: (typeof AcaoAuditoria)[keyof typeof AcaoAuditoria], antes: Record<string, unknown> | undefined, depois: Record<string, unknown> | undefined, effects: KeyRingEffects): Promise<AiApiKeyDto[]> {
    invalidateStoredIntegrations()
    await recordAudit({ userId: actorId, entidade: AI_API_KEY_AUDIT_ENTITY, entidadeId: `${provider}:${keyId}`, acao, antes, depois })
    log.info({ provider, keyId, acao, primaryChanged: effects.primaryChanged, poolChanged: effects.poolChanged }, "[ai] chaveiro do provedor alterado")
    if (effects.primaryChanged || effects.poolChanged) await afterKeyRingChange(provider, effects)
    await publishAppEvent(AI_PROVIDER_KEYS_UPDATED_EVENT, { provider })
    return listAiApiKeys(provider)
}

/**
 * Plano de cobrança da chave (OPE-203): Pago por uso, Assinatura ou Créditos. Só grava o plano (o custo efetivo é
 * derivado na leitura, então muda na hora; o custo de tabela gravado nos passos não muda). Auditado, com o evento
 * `ai-provider-keys-updated`.
 */
export async function updateAiKeyBilling(provider: AiApiKeyProviderId, keyId: string, raw: unknown, actorId: string): Promise<AiApiKeyDto[]> {
    if (!hasKeyBilling(provider)) throw new DomainError(404, "Este provedor não tem plano de cobrança", "AI_PROVIDER_NOT_FOUND")
    const billing = aiKeyBillingSchema.parse(raw)
    const doc = await loadKeyRing(provider)
    const item = findKey(doc, keyId)
    const previous = billingOf(item.billing)
    const before = stripSetAt(previous)
    if (JSON.stringify(before) === JSON.stringify(billing)) return listAiApiKeys(provider)
    // `setAt` é o início padrão dos créditos: só renova quando a modalidade muda (editar a validade não reinicia o histórico).
    const setAt = previous.mode === billing.mode && previous.setAt ? previous.setAt : new Date().toISOString()
    const stored: StoredAiKeyBilling = { ...billing, setAt }
    await updateKey(provider, keyId, {}, { $set: { "apiKeys.$.billing": stored, "apiKeys.$.updatedAt": new Date() }, _auditContext: { userId: actorId } })
    return finish(provider, actorId, keyId, AcaoAuditoria.ATUALIZAR, { provider, name: item.name, plano: before }, { provider, name: item.name, plano: billing }, { primaryChanged: false, poolChanged: false, hasPrimary: primaryIdOf(doc) !== null })
}

/** Nova chave. A primeira do provedor (ou sem principal válida) já entra como principal e em uso; as demais, fora de uso. */
export async function createAiApiKey(provider: AiApiKeyProviderId, raw: unknown, actorId: string): Promise<AiApiKeyDto[]> {
    const input = createAiApiKeySchema.parse(raw)
    const doc = await loadKeyRing(provider)
    assertUniqueName(doc, input.name)
    const secret = encrypt(input.secret)
    await ensureIntegrationDoc(provider, actorId)
    const now = new Date()
    const item: StoredApiKey = { id: newApiKeyId(), name: input.name, secret, createdAt: now, updatedAt: now, createdBy: actorId }
    const primary = !primaryIdOf(doc)
    await Integration.updateOne(
        { integrationId: integrationOf(provider) },
        { $push: { apiKeys: item }, ...(primary ? { $set: { activeApiKeyId: item.id, selectedApiKeyIds: [item.id] } } : {}), _auditContext: { userId: actorId } },
    )
    return finish(provider, actorId, item.id, AcaoAuditoria.CRIAR, undefined, { provider, name: item.name, emUso: primary, principal: primary, secret: "(definido)" }, { primaryChanged: primary, poolChanged: primary, hasPrimary: true })
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
    const replaced = input.secret !== undefined
    return finish(provider, actorId, keyId, AcaoAuditoria.ATUALIZAR, { provider, ...antes }, { provider, ...depois }, {
        primaryChanged: replaced && primaryIdOf(doc) === keyId,
        poolChanged: replaced && selectedIdsOf(doc).includes(keyId),
        hasPrimary: primaryIdOf(doc) !== null,
    })
}

/**
 * Gravação atômica sobre a chave: `matchedCount` 0 = a chave sumiu entre a leitura e a gravação (404)
 * ou a condição lida mudou (409), sem auditoria nem evento de um sucesso que não houve.
 */
async function updateKey(provider: AiApiKeyProviderId, keyId: string, filter: Record<string, unknown>, update: Record<string, unknown>): Promise<void> {
    const result = await Integration.updateOne({ integrationId: integrationOf(provider), "apiKeys.id": keyId, ...filter }, update)
    if (result.matchedCount > 0) return
    findKey(await loadKeyRing(provider), keyId)
    throw new DomainError(409, "O chaveiro mudou ao mesmo tempo: confira a lista e tente de novo", "AI_API_KEY_CONFLICT")
}

/** Ids a acrescentar ao rodízio: a chave e a principal lida (documentos sem o campo ganham a principal explicitamente). */
function addToPool(primaryId: string | null, keyId: string): { $addToSet: { selectedApiKeyIds: { $each: string[] } } } {
    return { $addToSet: { selectedApiKeyIds: { $each: primaryId && primaryId !== keyId ? [primaryId, keyId] : [keyId] } } }
}

/**
 * Põe ou tira a chave do rodízio. Sem principal, a chave posta em uso vira a principal. A principal não
 * sai de uso (409 `AI_API_KEY_PRIMARY`): o provedor configurado nunca fica sem chave em uso. A gravação é
 * atômica (`$addToSet`/`$pull`): cliques seguidos em chaves diferentes não se sobrescrevem.
 */
export async function setAiApiKeySelected(provider: AiApiKeyProviderId, keyId: string, raw: unknown, actorId: string): Promise<AiApiKeyDto[]> {
    const { selected } = aiApiKeySelectionSchema.parse(raw)
    const doc = await loadKeyRing(provider)
    const item = findKey(doc, keyId)
    const primaryId = primaryIdOf(doc)
    if (selected === selectedIdsOf(doc).includes(keyId)) return listAiApiKeys(provider)
    if (!selected && keyId === primaryId) throw new DomainError(409, "Esta é a chave principal: torne outra chave principal antes de tirá-la de uso", "AI_API_KEY_PRIMARY")
    const becomesPrimary = selected && !primaryId
    const audit = { userId: actorId }
    if (becomesPrimary) {
        // Sem principal válida, o rodízio recomeça só com esta chave; só grava se ninguém elegeu outra principal no meio.
        await updateKey(provider, keyId, { activeApiKeyId: doc?.activeApiKeyId ?? null }, { $set: { activeApiKeyId: keyId, selectedApiKeyIds: [keyId] }, _auditContext: audit })
    } else if (selected) {
        await updateKey(provider, keyId, {}, { ...addToPool(primaryId, keyId), _auditContext: audit })
    } else {
        // A principal não sai: só grava se esta chave ainda não virou a principal no meio.
        await updateKey(provider, keyId, { activeApiKeyId: { $ne: keyId } }, { $pull: { selectedApiKeyIds: keyId }, _auditContext: audit })
    }
    return finish(provider, actorId, keyId, AcaoAuditoria.ATUALIZAR, { provider, name: item.name, emUso: !selected }, { provider, name: item.name, emUso: selected, ...(becomesPrimary ? { principal: true } : {}) }, {
        primaryChanged: becomesPrimary,
        poolChanged: true,
        hasPrimary: true,
    })
}

/** Torna a chave a principal do provedor (só uma por vez); ela entra em uso se ainda não estava, e a anterior continua em uso. */
export async function makePrimaryAiApiKey(provider: AiApiKeyProviderId, keyId: string, actorId: string): Promise<AiApiKeyDto[]> {
    const doc = await loadKeyRing(provider)
    const item = findKey(doc, keyId)
    const primaryId = primaryIdOf(doc)
    if (primaryId === keyId) return listAiApiKeys(provider)
    const previous = doc?.apiKeys?.find((candidate) => candidate.id === primaryId)
    await updateKey(provider, keyId, {}, { $set: { activeApiKeyId: keyId }, ...addToPool(primaryId, keyId), _auditContext: { userId: actorId } })
    return finish(provider, actorId, keyId, AcaoAuditoria.ATUALIZAR, { provider, principal: previous?.name ?? null }, { provider, principal: item.name }, { primaryChanged: true, poolChanged: true, hasPrimary: true })
}

/**
 * Remove a chave (e a tira do rodízio). A principal só sai quando é a ÚNICA do provedor (o provedor fica
 * "Não configurado"); com outras chaves, é preciso tornar outra principal antes.
 */
export async function removeAiApiKey(provider: AiApiKeyProviderId, keyId: string, actorId: string): Promise<AiApiKeyDto[]> {
    const doc = await loadKeyRing(provider)
    const item = findKey(doc, keyId)
    const isPrimary = primaryIdOf(doc) === keyId
    const wasSelected = selectedIdsOf(doc).includes(keyId)
    if (isPrimary && (doc?.apiKeys?.length ?? 0) > 1) throw new DomainError(409, "Esta é a chave principal: torne outra chave principal antes de removê-la", "AI_API_KEY_PRIMARY")
    await Integration.updateOne(
        { integrationId: integrationOf(provider) },
        { $pull: { apiKeys: { id: keyId }, selectedApiKeyIds: keyId }, ...(isPrimary ? { $set: { activeApiKeyId: null } } : {}), _auditContext: { userId: actorId } },
    )
    return finish(provider, actorId, keyId, AcaoAuditoria.EXCLUIR, { provider, name: item.name, emUso: wasSelected, principal: isPrimary }, undefined, {
        primaryChanged: isPrimary,
        poolChanged: wasSelected && !isPrimary,
        hasPrimary: !isPrimary,
    })
}
