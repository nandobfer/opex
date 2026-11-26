import Fuse from "fuse.js"
import { DomainError } from "@/lib/api/route"
import { getAiProviderStatuses, listAiModels } from "@/lib/ai/catalog"
import { AiProviderError } from "@/lib/ai/errors"
import { getAiProvider, isAiProviderId, type AiModelDto, type AiProviderId } from "@/lib/ai/providers"
import { getIntegrationDef } from "@/lib/integrations/catalog"
import { getIntegration, isIntegrationConfigured } from "@/lib/integrations/config"
import { CONVERSATION_STATE_LABELS } from "../constants"
import { isGroupJid, jidNumber, LID_JID_SUFFIX } from "@/features/evolution-api/constants"
import { contactsByJid, listContacts } from "@/features/evolution-api/server/contacts"
import { listInstances } from "@/features/evolution-api/server/instances"
import type { EvolutionContactDto } from "@/features/evolution-api/types"
import { blockKeyOf, isFixedBlock, normalizePersonality, type PersonalityBlock, type PersonalitySnapshot } from "../personality"
import { DECISION_PROVIDER_IDS, personalitySchema, secretarySettingsSchema, variantSchema, type SecretarySettings } from "../schemas"
import { OPEX_PROVIDER_IDS } from "@/features/opex-agent/constants"
import { formatSettingsIssues, normalizeName } from "../settings-patch"
import { buildPersonalityView, buildSecretaryView, summarizePersonality, type PendingQuestionView } from "../settings-view"
import { listSecretaryConversations } from "./conversations"
import { SecretaryNotice, secretaryDb } from "./models"
import { listPersonalityVersions, loadPersonality, writeVersion } from "./personality"
import { loadSecretarySettings, saveSecretarySettings } from "./settings"

/**
 * Serviço das ferramentas do Agente Opex para o Agente Secretário (OPE-200). Leituras sem efeito colateral (só o
 * status gravado dos provedores, nunca um teste ao vivo; nada liga, desliga nem envia mensagem) e gravações que
 * passam pela mesma validação da tela (`secretarySettingsSchema` → `saveSecretarySettings`, com auditoria e
 * `ai-feature-updated`) e pelo `writeVersion` da personalidade.
 */

export type SecretaryModelRole = "main" | "media" | "analysis" | "decision"
const ROLE_LABELS: Record<SecretaryModelRole, string> = { main: "o agente", media: "a mídia", analysis: "a análise", decision: "quem decide o assunto" }

/** Nome da conversa sem expor o JID: o do cache de contatos; sem ele, o número (contato) ou um rótulo genérico. */
export function fallbackConversationName(jid: string): string {
    if (isGroupJid(jid)) return "Grupo fora dos contatos"
    if (jid.endsWith(LID_JID_SUFFIX)) return "Contato sem nome"
    return `+${jidNumber(jid)}`
}

async function evolutionConfigured(): Promise<boolean> {
    try {
        return isIntegrationConfigured(getIntegrationDef("evolution-api"), await getIntegration("evolution-api"))
    } catch {
        return false
    }
}

async function catalogOf(provider: string): Promise<AiModelDto[]> {
    if (!isAiProviderId(provider)) return []
    return listAiModels(provider).catch(() => [])
}

function settingsJids(settings: SecretarySettings, snapshot?: PersonalitySnapshot): string[] {
    return [...new Set([...settings.criteria.audience.selected, ...settings.criteria.audience.blocked, ...(snapshot?.variants.map((variant) => variant.jid) ?? [])])]
}

async function nameResolver(jids: string[], instance: string | null): Promise<(jid: string) => string> {
    const contacts = await contactsByJid(jids, instance ?? undefined).catch(() => new Map<string, EvolutionContactDto>())
    return (jid) => contacts.get(jid)?.name ?? fallbackConversationName(jid)
}

async function pendingQuestions(): Promise<PendingQuestionView[]> {
    await secretaryDb()
    const rows = await SecretaryNotice.find({ kind: "question", status: "pending" }).select("-trigger -ownerRevision").sort({ at: -1 }).limit(50).lean()
    return rows.map((row) => ({
        ref: row._id,
        contact: row.contactName || fallbackConversationName(row.jid),
        ...(row.author ? { author: row.author } : {}),
        question: row.text,
        ...(row.excerpt ? { excerpt: row.excerpt } : {}),
        askedAt: row.at.toISOString(),
    }))
}

/** Retrato completo do Secretário (aba Geral, Critérios, resumo da Personalidade e perguntas pendentes). */
export async function getSecretaryOverview() {
    const { settings } = await loadSecretarySettings()
    const [statuses, instances, configured, personality, questions] = await Promise.all([
        getAiProviderStatuses(),
        settings.instance ? listInstances() : Promise.resolve(null),
        evolutionConfigured(),
        loadPersonality(),
        pendingQuestions(),
    ])
    const providers = [settings.main.provider, settings.media.model.provider, settings.analysis.model.provider, settings.decision.model.provider, ...Object.keys(settings.pricing).map((key) => key.split("/")[0] ?? "")]
    const catalogs = new Map(await Promise.all([...new Set(providers.filter((id): id is string => Boolean(id)))].map(async (id) => [id, await catalogOf(id)] as const)))
    const nameOf = await nameResolver(settingsJids(settings, personality.snapshot), settings.instance)
    const instance = instances?.instances.find((item) => item.name === settings.instance) ?? null
    const view = buildSecretaryView(settings, {
        providerName: (id) => (isAiProviderId(id) ? getAiProvider(id).name : id),
        modelName: (provider, model) => catalogs.get(provider)?.find((item) => item.id === model)?.name ?? null,
        nameOf,
        instance,
        providerStatus: (id) => statuses.find((item) => item.id === id) ?? null,
        evolutionConfigured: configured,
    })
    return {
        ...view,
        personality: summarizePersonality(personality.snapshot, nameOf),
        pendingQuestions: questions.length ? questions : "Nenhuma pergunta pendente",
        notes: "Responda ao dono com nomes; nunca mostre o campo ref das perguntas (uso só em answer_secretary_question/discard_secretary_question).",
    }
}

/** Provedores e, com um provedor, os modelos do catálogo aceitos no papel. */
export async function secretaryModelOptions(role: SecretaryModelRole, provider?: string) {
    const allowed: readonly string[] = role === "decision" ? DECISION_PROVIDER_IDS : OPEX_PROVIDER_IDS
    const statuses = await getAiProviderStatuses()
    const providers = statuses.filter((item) => allowed.includes(item.id)).map((item) => ({ provider: item.id, name: item.name, configured: item.configured, connected: item.connected }))
    if (!provider) return { role: ROLE_LABELS[role], providers }
    if (!allowed.includes(provider) || !isAiProviderId(provider)) throw new DomainError(400, `Provedor ${provider} não é aceito para ${ROLE_LABELS[role]}. Aceitos: ${providers.map((item) => item.name).join(", ")}.`, "SECRETARY_PROVIDER_INVALID")
    const models = await loadCatalog(provider)
    return { role: ROLE_LABELS[role], provider: getAiProvider(provider).name, models: models.map((item) => ({ id: item.id, name: item.name, ...(item.variants.length ? { variants: item.variants } : {}) })) }
}

async function loadCatalog(provider: AiProviderId): Promise<AiModelDto[]> {
    const name = getAiProvider(provider).name
    const status = (await getAiProviderStatuses()).find((item) => item.id === provider)
    if (!status?.configured) throw new DomainError(409, `${name} não está configurado: cadastre a chave em Integrações › Inteligência Artificial › ${name} antes de escolher um modelo dele.`, "AI_PROVIDER_NOT_CONFIGURED")
    try {
        return await listAiModels(provider)
    } catch (error) {
        if (error instanceof AiProviderError) throw new DomainError(502, `Não foi possível ler os modelos de ${name}: ${error.message}`, "AI_PROVIDER_ERROR")
        throw error
    }
}

/**
 * Confere provedor, modelo (pelo identificador ou pelo nome do catálogo) e variante de um papel. Devolve o
 * identificador do catálogo (o que a tela grava). Provedor sem chave, modelo inexistente ou variante inválida são
 * recusados com o motivo.
 */
export async function resolveSecretaryModel(role: SecretaryModelRole, input: { provider: string; model: string; variant?: string | null }) {
    const allowed: readonly string[] = role === "decision" ? DECISION_PROVIDER_IDS : OPEX_PROVIDER_IDS
    if (!allowed.includes(input.provider) || !isAiProviderId(input.provider)) {
        throw new DomainError(400, `Provedor ${input.provider} não é aceito para ${ROLE_LABELS[role]}. Use list_secretary_model_options para ver os aceitos.`, "SECRETARY_PROVIDER_INVALID")
    }
    const provider = input.provider
    const models = await loadCatalog(provider)
    const wanted = normalizeName(input.model)
    const model = models.find((item) => item.id === input.model) ?? models.find((item) => normalizeName(item.id) === wanted || normalizeName(item.name) === wanted)
    const name = getAiProvider(provider).name
    if (!model) throw new DomainError(400, `O modelo "${input.model}" não existe no ${name}. Use list_secretary_model_options com o provedor para ver os modelos disponíveis.`, "AI_MODEL_NOT_FOUND")
    if (input.variant && !model.variants.includes(input.variant)) {
        throw new DomainError(400, `${getAiProvider(provider).variantLabel} "${input.variant}" não existe no modelo ${model.name}${model.variants.length ? ` (disponíveis: ${model.variants.join(", ")})` : " (o modelo não tem variantes)"}.`, "AI_VARIANT_NOT_FOUND")
    }
    return { provider, model: model.id, modelName: model.name, providerName: name, variant: input.variant ?? null }
}

/**
 * Aplica uma mudança: carrega, muda, valida com o schema da tela e grava. Recusa sem gravar nada, com o que falta.
 * Sem diferença, não grava (sem auditoria vazia).
 */
export async function changeSecretarySettings(mutate: (settings: SecretarySettings) => SecretarySettings, actorId: string) {
    const { settings: before } = await loadSecretarySettings()
    const parsed = secretarySettingsSchema.safeParse(mutate(structuredClone(before)))
    if (!parsed.success) throw new DomainError(400, formatSettingsIssues(parsed.error), "SECRETARY_SETTINGS_INVALID")
    if (JSON.stringify(parsed.data) === JSON.stringify(before)) return { saved: false, message: "Nada mudou: a configuração já estava assim." }
    await saveSecretarySettings(parsed.data, actorId)
    return { saved: true, settings: await getSecretaryOverview() }
}

/** Instância escolhida pelo nome, conferida na Evolution. */
export async function resolveSecretaryInstance(name: string) {
    const list = await listInstances()
    if (list.error && !list.instances.length) throw new DomainError(409, `Não foi possível ler as instâncias da Evolution API: ${list.error}`, "EVOLUTION_UNAVAILABLE")
    const wanted = normalizeName(name)
    const found = list.instances.find((item) => item.name === name) ?? list.instances.find((item) => normalizeName(item.name) === wanted || (item.profileName && normalizeName(item.profileName) === wanted))
    if (!found) throw new DomainError(404, `A instância "${name}" não existe na Evolution. Disponíveis: ${list.instances.map((item) => item.name).join(", ") || "nenhuma (configure a Evolution API primeiro)"}.`, "EVOLUTION_INSTANCE_NOT_FOUND")
    return found
}

type ConversationRow = { jid: string; name: string; number: string | null; isGroup: boolean }
const label = (row: ConversationRow) => `${row.name}${row.number ? ` (+${row.number})` : row.isGroup ? " (grupo)" : ""}`

/**
 * Conversa pelo nome ou número entre as conversas da instância (e as já citadas nos critérios ou nas variantes).
 * Nome igual a mais de uma conversa é recusado com os candidatos; nenhuma, com a dica de busca.
 */
export async function resolveSecretaryConversation(query: string, extraJids: readonly string[] = []): Promise<ConversationRow> {
    const { settings } = await loadSecretarySettings()
    if (!settings.instance) throw new DomainError(409, "Escolha antes a instância do WhatsApp do Secretário: as conversas vêm dela.", "SECRETARY_NO_INSTANCE")
    const chats = await listContacts("chats", settings.instance)
    const known = new Map<string, ConversationRow>(chats.map((chat) => [chat.jid, chat]))
    const missing = [...new Set([...settingsJids(settings), ...extraJids])].filter((jid) => !known.has(jid))
    if (missing.length) {
        const extra = await contactsByJid(missing, settings.instance).catch(() => new Map<string, EvolutionContactDto>())
        for (const jid of missing) known.set(jid, extra.get(jid) ?? { jid, name: fallbackConversationName(jid), number: isGroupJid(jid) || jid.endsWith(LID_JID_SUFFIX) ? null : jidNumber(jid), isGroup: isGroupJid(jid) })
    }
    const rows = [...known.values()]
    const digits = query.replace(/\D/g, "")
    const wanted = normalizeName(query)
    let matches = digits.length >= 8 && digits.length === query.replace(/[\s+()-]/g, "").length ? rows.filter((row) => row.number && (row.number === digits || row.number.endsWith(digits))) : []
    if (!matches.length) matches = rows.filter((row) => normalizeName(row.name) === wanted)
    if (!matches.length) matches = rows.filter((row) => normalizeName(row.name).includes(wanted))
    if (matches.length === 1) return matches[0]
    if (!matches.length) throw new DomainError(404, `Nenhuma conversa encontrada para "${query}". Use find_secretary_conversations para buscar pelo nome.`, "SECRETARY_CONVERSATION_NOT_FOUND")
    throw new DomainError(409, `Mais de uma conversa corresponde a "${query}": ${matches.slice(0, 10).map(label).join("; ")}. Pergunte ao dono qual delas e informe o nome completo ou o número.`, "SECRETARY_CONVERSATION_AMBIGUOUS")
}

export async function resolveSecretaryConversations(queries: readonly string[] | undefined): Promise<ConversationRow[]> {
    const out: ConversationRow[] = []
    for (const query of queries ?? []) out.push(await resolveSecretaryConversation(query))
    return out
}

/** Busca das conversas da instância (nome, tipo, número, estado do Secretário e listas dos critérios). */
export async function findSecretaryConversations(query: string | undefined, limit = 30) {
    const { settings } = await loadSecretarySettings()
    if (!settings.instance) throw new DomainError(409, "Escolha antes a instância do WhatsApp do Secretário: as conversas vêm dela.", "SECRETARY_NO_INSTANCE")
    const rows = await listSecretaryConversations()
    const found = query?.trim() ? new Fuse(rows, { keys: ["name", "number"], threshold: 0.35, ignoreLocation: true }).search(query.trim()).map((hit) => hit.item) : rows
    return {
        total: found.length,
        conversations: found.slice(0, limit).map((row) => ({
            name: row.name,
            type: row.isGroup ? "Grupo" : "Individual",
            ...(row.number ? { number: `+${row.number}` } : {}),
            state: CONVERSATION_STATE_LABELS[row.state],
            selected: settings.criteria.audience.selected.includes(row.jid),
            neverAnswer: settings.criteria.audience.blocked.includes(row.jid),
        })),
    }
}

// ── Personalidade ────────────────────────────────────────────────────────────

export async function getSecretaryPersonality() {
    const [{ snapshot }, versions, { settings }] = await Promise.all([loadPersonality(), listPersonalityVersions(), loadSecretarySettings()])
    const nameOf = await nameResolver(snapshot.variants.map((variant) => variant.jid), settings.instance)
    const origins: Record<string, string> = { edit: "Edição", analysis: "Análise", "analysis-cancelled": "Análise cancelada", "analysis-unapplied": "Análise não aplicada", restore: "Restauração" }
    return {
        ...buildPersonalityView({ base: normalizePersonality(snapshot.base), variants: snapshot.variants }, nameOf),
        recentVersions: versions.slice(0, 10).map((version) => ({ at: version.at.toISOString(), origin: origins[version.origin] ?? version.origin, blocksChanged: version.changes?.length ?? 0 })),
    }
}

const sameTitle = (block: PersonalityBlock, title: string) => normalizeName(block.title) === normalizeName(title)

export async function upsertSecretaryBaseBlock(input: { title: string; content: string }, actorId: string) {
    const { versionId, snapshot } = await loadPersonality()
    const base = normalizePersonality(snapshot.base)
    const existing = base.blocks.find((block) => sameTitle(block, input.title))
    const blocks = existing
        ? base.blocks.map((block) => (block === existing ? { ...block, content: input.content } : block))
        : [...base.blocks, { key: blockKeyOf(input.title, base.blocks.map((block) => block.key)), title: input.title.trim(), content: input.content }]
    const parsed = personalitySchema.parse({ blocks })
    await writeVersion({ ...snapshot, base: parsed }, "edit", actorId, versionId)
    return { saved: true, created: !existing, block: existing?.title ?? input.title.trim() }
}

export async function removeSecretaryBaseBlock(title: string, actorId: string) {
    const { versionId, snapshot } = await loadPersonality()
    const base = normalizePersonality(snapshot.base)
    const existing = base.blocks.find((block) => sameTitle(block, title))
    if (!existing) throw new DomainError(404, `Bloco "${title}" não encontrado. Blocos: ${base.blocks.map((block) => block.title).join(", ")}.`, "SECRETARY_BLOCK_NOT_FOUND")
    const fixed = isFixedBlock(existing.key)
    const blocks = fixed ? base.blocks.map((block) => (block === existing ? { ...block, content: "" } : block)) : base.blocks.filter((block) => block !== existing)
    await writeVersion({ ...snapshot, base: { blocks } }, "edit", actorId, versionId)
    return { saved: true, block: existing.title, result: fixed ? "Bloco fixo esvaziado (os blocos fixos não são removidos)" : "Bloco extra removido" }
}

async function variantTarget(conversation: string, variants: PersonalitySnapshot["variants"], instance: string | null) {
    if (variants.length) {
        const nameOf = await nameResolver(variants.map((variant) => variant.jid), instance)
        const byName = variants.filter((variant) => normalizeName(nameOf(variant.jid)) === normalizeName(conversation) || normalizeName(variant.title) === normalizeName(conversation))
        if (byName.length === 1) return { jid: byName[0].jid, name: nameOf(byName[0].jid) }
    }
    const row = await resolveSecretaryConversation(conversation, variants.map((variant) => variant.jid))
    return { jid: row.jid, name: row.name }
}

/** Cria ou edita a variante de uma conversa: blocos mesclados pelo título (a chave segue a do bloco da base). */
export async function upsertSecretaryVariant(input: { conversation: string; title?: string; blocks: { title: string; content: string }[] }, actorId: string) {
    const [{ versionId, snapshot }, { settings }] = await Promise.all([loadPersonality(), loadSecretarySettings()])
    const target = await variantTarget(input.conversation, snapshot.variants, settings.instance)
    const current = snapshot.variants.find((variant) => variant.jid === target.jid)
    const base = normalizePersonality(snapshot.base)
    let blocks = [...(current?.blocks ?? [])]
    for (const change of input.blocks) {
        const at = blocks.findIndex((block) => sameTitle(block, change.title))
        if (!change.content.trim()) {
            if (at >= 0) blocks = blocks.filter((_, index) => index !== at)
            continue
        }
        if (at >= 0) blocks[at] = { ...blocks[at], content: change.content }
        else {
            const baseBlock = base.blocks.find((block) => sameTitle(block, change.title))
            blocks.push({ key: baseBlock?.key ?? blockKeyOf(change.title, [...base.blocks, ...blocks].map((block) => block.key)), title: baseBlock?.title ?? change.title.trim(), content: change.content })
        }
    }
    const parsed = variantSchema.parse({ jid: target.jid, title: input.title?.trim() || current?.title || target.name, blocks })
    const next = { ...snapshot, variants: [...snapshot.variants.filter((variant) => variant.jid !== target.jid), { ...parsed, origin: "owner" as const }] }
    await writeVersion(next, "edit", actorId, versionId)
    return { saved: true, created: !current, conversation: target.name, title: parsed.title, blocks: parsed.blocks.map((block) => block.title) }
}

export async function removeSecretaryVariant(conversation: string, actorId: string) {
    const [{ versionId, snapshot }, { settings }] = await Promise.all([loadPersonality(), loadSecretarySettings()])
    if (!snapshot.variants.length) throw new DomainError(404, "Não há variantes de personalidade cadastradas.", "SECRETARY_VARIANT_NOT_FOUND")
    const target = await variantTarget(conversation, snapshot.variants, settings.instance)
    const variants = snapshot.variants.filter((variant) => variant.jid !== target.jid)
    if (variants.length === snapshot.variants.length) throw new DomainError(404, `A conversa ${target.name} não tem variante de personalidade.`, "SECRETARY_VARIANT_NOT_FOUND")
    await writeVersion({ ...snapshot, variants }, "edit", actorId, versionId)
    return { saved: true, removed: target.name }
}

// ── Perguntas ao dono (aba Avisos) ──────────────────────────────────────────

export async function answerSecretaryQuestion(ref: string, answer: string, actorId: string) {
    const { answerNotice } = await import("./owner-questions")
    await answerNotice(ref, answer, actorId)
    return { ok: true, message: "Resposta registrada: o Secretário aprendeu e retoma a conversa (se ainda couber)." }
}

export async function discardSecretaryQuestion(ref: string, actorId: string) {
    const { discardNotice } = await import("./owner-questions")
    await discardNotice(ref, actorId)
    return { ok: true, message: "Pergunta descartada." }
}
