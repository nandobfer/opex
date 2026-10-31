import { DomainError } from "@/lib/api/route"
import { getIntegration, getIntegrationConfig } from "@/lib/integrations/config"
import {
    AI_SOURCE_SECTIONS,
    OPEX_KEY_INTEGRATION,
    OPEX_KEY_PROVIDER_NAMES,
    SECTION_SECRET_KEY,
    deriveOrigin,
    describeCurrent,
    embeddingProviderOf,
    opexKeyProviderOf,
    redatorProviderOf,
    sectionSettingsOf,
    usesOpexKey,
    type AiSourceSection,
    type AiSourceSnapshot,
    type EmbeddingSource,
    type OpexKeyProvider,
    type RedatorSource,
} from "../ai-source"
import { ENGRAMIND_INTEGRATION_ID } from "../constants"
import { applyAiSourceSchema, resendAiKeySchema, testAiSourceSchema } from "../schemas/ai-source"
import type { AiSourceSectionDto, AiSourceStateDto, ApplyAiSourceResult, EngramindStatus, SettingMeta } from "../types"
import { engramindCall } from "./client"
import { requireUsableConnection } from "./connection"
import { ENGRAMIND_STATE_ID, EngramindState, engramindDb, type IEngramindAiSource, type IEngramindState } from "./models"
import { AcaoAuditoria, auditEngramind, engramindLog, publishEngramind } from "./shared"

/**
 * "IA do Opex" no Engramind (SOMENTE servidor): copia provedor, modelo e a chave do Opex para o
 * Redator e o embedding, mantém a chave alinhada quando ela muda no Opex e expõe a origem derivada do
 * valor em uso. A chave nunca sai daqui para a tela, o modelo, o histórico ou os logs.
 */

async function loadState(): Promise<IEngramindState | null> {
    await engramindDb()
    return EngramindState.findById(ENGRAMIND_STATE_ID).lean<IEngramindState>()
}

async function saveSource(section: AiSourceSection, patch: Partial<IEngramindAiSource> | IEngramindAiSource): Promise<void> {
    await engramindDb()
    const $set = Object.fromEntries(Object.entries(patch).map(([key, value]) => [`sources.${section}.${key}`, value]))
    await EngramindState.updateOne({ _id: ENGRAMIND_STATE_ID }, { $set }, { upsert: true })
}

const toSnapshot = (source: IEngramindAiSource | null | undefined): AiSourceSnapshot | null =>
    source
        ? {
              provider: source.provider,
              model: source.model,
              fallbackModels: source.fallbackModels ?? [],
              dimensions: source.dimensions ?? null,
              temperature: source.temperature ?? null,
              syncedAt: source.syncedAt ? new Date(source.syncedAt).toISOString() : null,
              syncError: source.syncError ?? null,
              appliedAt: new Date(source.appliedAt).toISOString(),
          }
        : null

async function readSettings(): Promise<{ values: Record<string, unknown>; metas: SettingMeta[] }> {
    const result = await engramindCall<{ settings: SettingMeta[] }>("GET", { path: "/v1/settings" })
    const metas = result?.settings ?? []
    return { values: Object.fromEntries(metas.map((meta) => [meta.key, meta.value])), metas }
}

async function readStatus(): Promise<EngramindStatus | null> {
    try {
        return await engramindCall<EngramindStatus>("GET", { path: "/v1/status" })
    } catch (error) {
        engramindLog.warn({ err: error }, "[engramind] status indisponível ao ler a IA do Opex")
        return null
    }
}

async function opexKeyOf(provider: OpexKeyProvider): Promise<{ apiKey: string | null; version: string }> {
    const integrationId = OPEX_KEY_INTEGRATION[provider]
    const [config, resolved] = await Promise.all([getIntegrationConfig(integrationId), getIntegration(integrationId)])
    const apiKey = (config as { apiKey?: string | null }).apiKey
    return { apiKey: apiKey && apiKey.trim() ? apiKey : null, version: resolved.version }
}

function sectionDto(section: AiSourceSection, values: Record<string, unknown>, metas: SettingMeta[], source: IEngramindAiSource | null | undefined, sourceKeyMissing: boolean): AiSourceSectionDto {
    const secret = metas.find((meta) => meta.key === SECTION_SECRET_KEY[section])
    const snapshot = toSnapshot(source)
    return {
        section,
        origin: deriveOrigin(section, values, snapshot, secret?.updated_at ?? null),
        provider: snapshot?.provider ?? null,
        model: snapshot?.model ?? null,
        fallbackModels: snapshot?.fallbackModels ?? [],
        dimensions: snapshot?.dimensions ?? null,
        temperature: snapshot?.temperature ?? null,
        current: describeCurrent(section, values),
        currentOpexProvider: section === "redator" ? redatorProviderOf(values) : embeddingProviderOf(values),
        keyConfigured: secret ? Boolean(secret.configured) : null,
        keyUpdatedAt: secret?.updated_at ?? null,
        syncedAt: snapshot?.syncedAt ?? null,
        syncError: snapshot?.syncError ?? null,
        sourceKeyMissing,
    }
}

/** Estado das duas seções (origem derivada do valor em uso + estado da sincronização). */
export async function getOpexAiSourceState(): Promise<AiSourceStateDto> {
    await requireUsableConnection()
    const [{ values, metas }, state, status] = await Promise.all([readSettings(), loadState(), readStatus()])
    const sections = await Promise.all(
        AI_SOURCE_SECTIONS.map(async (section) => {
            const source = state?.sources?.[section] ?? null
            const missing = source && usesOpexKey(source.provider) ? (await opexKeyOf(source.provider)).apiKey === null : false
            return sectionDto(section, values, metas, source, missing)
        }),
    )
    return { redator: sections[0]!, embedding: sections[1]!, reindexing: status?.embedding?.state === "reindexing", localModel: status?.embedding?.local ?? null }
}

async function putSecret(section: AiSourceSection, apiKey: string): Promise<void> {
    await engramindCall("PUT", { path: `/v1/secrets/${encodeURIComponent(SECTION_SECRET_KEY[section])}`, body: { value: apiKey } }, { sensitiveBody: true })
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

function keyMissingError(provider: OpexKeyProvider): DomainError {
    return new DomainError(409, `Configure a chave do ${OPEX_KEY_PROVIDER_NAMES[provider]} em Integrações › Inteligência Artificial`, "ENGRAMIND_AI_KEY_MISSING")
}

/**
 * Aplica a origem do Opex numa seção. Redator: grava as configurações e depois a chave (falha na
 * chave mantém as configurações e pede "Reenviar a chave"). Embedding: o Engramind valida o provedor
 * ao trocar, então a proposta é testada com a chave antes, a chave vai primeiro e as configurações
 * depois (falha na chave aborta sem mudar nada).
 */
export async function applyOpexAiSource(raw: unknown, actorId: string): Promise<ApplyAiSourceResult> {
    const input = applyAiSourceSchema.parse(raw)
    await requireUsableConnection()
    const { section } = input
    const source = input.source as RedatorSource | EmbeddingSource
    if (section === "embedding") {
        const status = await readStatus()
        if (status?.embedding?.state === "reindexing") throw new DomainError(409, "A reindexação está em andamento: aguarde terminar para trocar o embedding", "ENGRAMIND_REINDEXING")
    }
    const key = usesOpexKey(source.provider) ? await opexKeyOf(source.provider) : null
    if (key && !key.apiKey) throw keyMissingError(source.provider as OpexKeyProvider)
    const settings = sectionSettingsOf(section, source)
    const snapshot: IEngramindAiSource = {
        provider: source.provider,
        model: source.model ?? null,
        fallbackModels: "fallbackModels" in source ? source.fallbackModels : [],
        dimensions: "dimensions" in source ? source.dimensions : null,
        temperature: "temperature" in source ? source.temperature : null,
        keyVersion: key?.version ?? null,
        syncedAt: null,
        syncError: null,
        appliedAt: new Date(),
    }

    let keySynced = key === null
    if (section === "embedding") {
        if (key?.apiKey) {
            await engramindCall("POST", { path: "/v1/settings/embedding/test", body: { text: "Opex: teste do embedding", settings: { ...settings, [SECTION_SECRET_KEY.embedding]: key.apiKey } } }, { sensitiveBody: true })
            await putSecret(section, key.apiKey)
            keySynced = true
            snapshot.syncedAt = new Date()
        }
        await engramindCall("PUT", { path: "/v1/settings", body: settings })
    } else {
        await engramindCall("PUT", { path: "/v1/settings", body: settings })
        if (key?.apiKey) {
            try {
                await putSecret(section, key.apiKey)
                keySynced = true
                snapshot.syncedAt = new Date()
            } catch (error) {
                snapshot.syncError = errorText(error)
                engramindLog.warn({ err: error, section, provider: source.provider }, "[engramind] configurações gravadas, mas a chave não foi copiada")
            }
        }
    }
    await saveSource(section, snapshot)
    await auditEngramind(actorId, "ai_source.apply", AcaoAuditoria.ATUALIZAR, { section, provider: source.provider, model: snapshot.model, fallbackModels: snapshot.fallbackModels, dimensions: snapshot.dimensions, temperature: snapshot.temperature, keySynced })
    engramindLog.info({ section, provider: source.provider, model: snapshot.model, keySynced, actorId }, "[engramind] IA do Opex aplicada")
    await publishEngramind({ type: "settings.updated", keys: Object.keys(settings) })
    return { applied: true, keySynced, state: await getOpexAiSourceState() }
}

/** Testa a configuração proposta com a chave do Opex, sem gravar nada (nem a chave). */
export async function testOpexAiSource(raw: unknown): Promise<unknown> {
    const input = testAiSourceSchema.parse(raw)
    await requireUsableConnection()
    const source = input.source as RedatorSource | EmbeddingSource
    const settings = sectionSettingsOf(input.section, source)
    if (usesOpexKey(source.provider)) {
        const key = await opexKeyOf(source.provider)
        if (!key.apiKey) throw keyMissingError(source.provider)
        settings[SECTION_SECRET_KEY[input.section]] = key.apiKey
    }
    const path = input.section === "redator" ? "/v1/settings/redator/test" : "/v1/settings/embedding/test"
    const text = input.text ?? (input.section === "redator" ? "o deploy do opex roda com pnpm build e docker compose no servidor" : "Opex: teste do embedding")
    return engramindCall("POST", { path, body: { text, settings } }, { sensitiveBody: true })
}

/** Reenvia só a chave da origem gravada numa seção. */
export async function resendOpexAiKey(raw: unknown, actorId: string): Promise<AiSourceStateDto> {
    const { section } = resendAiKeySchema.parse(raw)
    await requireUsableConnection()
    const source = (await loadState())?.sources?.[section]
    if (!source || !usesOpexKey(source.provider)) throw new DomainError(409, "Esta seção não usa uma chave do Opex", "ENGRAMIND_AI_SOURCE_NONE")
    const key = await opexKeyOf(source.provider)
    if (!key.apiKey) throw keyMissingError(source.provider)
    try {
        await putSecret(section, key.apiKey)
    } catch (error) {
        await saveSource(section, { syncError: errorText(error) })
        throw error
    }
    await saveSource(section, { syncedAt: new Date(), syncError: null, keyVersion: key.version })
    await auditEngramind(actorId, "ai_source.resend_key", AcaoAuditoria.ATUALIZAR, { section, provider: source.provider })
    engramindLog.info({ section, provider: source.provider, actorId }, "[engramind] chave do Opex reenviada")
    await publishEngramind({ type: "settings.updated", keys: [SECTION_SECRET_KEY[section]] })
    return getOpexAiSourceState()
}

async function engramindConfigured(): Promise<boolean> {
    const config = await getIntegrationConfig(ENGRAMIND_INTEGRATION_ID)
    return Boolean(config.baseUrl && config.adminToken)
}

/**
 * Chamada depois que a chave de um provedor de IA muda no Opex: reenvia a chave a toda seção que usa
 * esse provedor. Nunca propaga erro (o salvamento no Opex já aconteceu): a falha vira `syncError`
 * (a tela mostra "Reenviar a chave") e log de aviso.
 */
export async function syncEngramindProviderKey(integrationId: string): Promise<void> {
    const provider = opexKeyProviderOf(integrationId)
    if (!provider) return
    try {
        if (!(await engramindConfigured())) {
            engramindLog.info({ integrationId }, "[engramind] sincronização da chave ignorada: Engramind não configurado")
            return
        }
        const state = await loadState()
        const sections = AI_SOURCE_SECTIONS.filter((section) => state?.sources?.[section]?.provider === provider)
        if (sections.length === 0) {
            engramindLog.info({ integrationId }, "[engramind] sincronização da chave ignorada: nenhuma seção usa este provedor")
            return
        }
        const key = await opexKeyOf(provider)
        if (!key.apiKey) {
            for (const section of sections) await saveSource(section, { syncError: "Chave apagada no Opex" })
            engramindLog.info({ integrationId, sections }, "[engramind] chave apagada no Opex: nada foi enviado ao Engramind")
            await publishEngramind({ type: "settings.updated" })
            return
        }
        for (const section of sections) {
            try {
                await putSecret(section, key.apiKey)
                await saveSource(section, { syncedAt: new Date(), syncError: null, keyVersion: key.version })
                engramindLog.info({ integrationId, section }, "[engramind] chave do Opex sincronizada")
            } catch (error) {
                await saveSource(section, { syncError: errorText(error) })
                engramindLog.warn({ err: error, integrationId, section }, "[engramind] falha ao sincronizar a chave do Opex")
            }
        }
        await publishEngramind({ type: "settings.updated", keys: sections.map((section) => SECTION_SECRET_KEY[section]) })
    } catch (error) {
        engramindLog.warn({ err: error, integrationId }, "[engramind] falha ao sincronizar a chave do Opex")
    }
}
