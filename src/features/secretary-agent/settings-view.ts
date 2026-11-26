import { EVOLUTION_STATE_LABELS, type EvolutionConnectionState } from "@/features/evolution-api/constants"
import { SECRETARY_MODE_LABELS } from "./constants"
import { describeCriteria } from "./criteria-describe"
import { FIXED_BLOCKS, isFixedBlock, type PersonalitySnapshot } from "./personality"
import type { SecretarySettings, SubjectRule } from "./schemas"
import { secretaryReadiness } from "./settings-patch"

/**
 * Retrato legível do Agente Secretário (PURO) para o Agente Opex (OPE-200): nome do provedor e do modelo, instância,
 * contatos e grupos pelo nome, assuntos e blocos pelo título. Nunca devolve JID, chave de preço, id de assunto nem
 * ObjectId; os nomes chegam resolvidos pelos `lookups` (o servidor consulta catálogo, contatos e Evolution).
 */

export interface SecretaryViewLookups {
    providerName: (provider: string) => string
    /** Nome do modelo no catálogo do provedor (`null` = fora do catálogo ou catálogo indisponível). */
    modelName: (provider: string, model: string) => string | null
    /** Nome da conversa (contato ou grupo), sem o JID. */
    nameOf: (jid: string) => string
    instance: { name: string; profileName: string | null; number: string | null; state: EvolutionConnectionState } | null
    /** Situação gravada dos provedores (sem testar agora). */
    providerStatus: (provider: string) => { configured: boolean; connected: boolean } | null
    evolutionConfigured: boolean
}

export interface PendingQuestionView {
    /** Referência opaca para answer/discard; não mostrar ao dono. */
    ref: string
    contact: string
    author?: string
    question: string
    excerpt?: string
    askedAt: string
}

type ModelRef = { provider: string | null; model: string | null; variant: string | null }
const yesNo = (value: boolean) => (value ? "Sim" : "Não")

function modelLabel(ref: ModelRef, lookups: SecretaryViewLookups) {
    if (!ref.provider) return { provider: null, model: null, summary: "Não escolhido" }
    const provider = lookups.providerName(ref.provider)
    const model = ref.model ? (lookups.modelName(ref.provider, ref.model) ?? ref.model) : null
    return { provider, model, ...(ref.variant ? { variant: ref.variant } : {}), summary: model ? `${provider} · ${model}${ref.variant ? ` (${ref.variant})` : ""}` : `${provider} · modelo não escolhido` }
}

function secondaryLabel(ref: ModelRef & { sameAsAgent: boolean }, lookups: SecretaryViewLookups) {
    return ref.sameAsAgent ? { sameAsAgent: true, summary: "Mesmo do agente" } : { sameAsAgent: false, ...modelLabel(ref, lookups) }
}

const subjectView = (rule: SubjectRule) => ({ name: rule.name, ...(rule.description ? { description: rule.description } : {}), ...(rule.examples.length ? { examples: rule.examples } : {}) })

/** Modelo, provedor e situação de cada segredo envolvido (só "configurado"/"conectado", nunca o valor). */
function secretsView(settings: SecretarySettings, lookups: SecretaryViewLookups) {
    const providers = [...new Set([settings.main.provider, ...[settings.media.model, settings.analysis.model, settings.decision.model].filter((ref) => !ref.sameAsAgent).map((ref) => ref.provider)].filter((id): id is NonNullable<typeof id> => Boolean(id)))]
    return {
        providers: providers.map((id) => {
            const status = lookups.providerStatus(id)
            return { provider: lookups.providerName(id), key: status?.configured ? "configurada" : "não configurada", connection: status?.connected ? "conectado" : "não conectado" }
        }),
        evolutionApi: lookups.evolutionConfigured ? "configurada" : "não configurada",
    }
}

export function buildSecretaryView(settings: SecretarySettings, lookups: SecretaryViewLookups) {
    const { audience, subjects } = settings.criteria
    const prices = Object.entries(settings.pricing).flatMap(([key, price]) => {
        const at = key.indexOf("/")
        if (at <= 0) return []
        const provider = key.slice(0, at), model = key.slice(at + 1)
        return [{ model: `${lookups.modelName(provider, model) ?? model} (${lookups.providerName(provider)})`, inputPerMTok: price.inputPerMTok, outputPerMTok: price.outputPerMTok }]
    })
    const instance = settings.instance
        ? lookups.instance && lookups.instance.name === settings.instance
            ? { name: lookups.instance.name, ...(lookups.instance.profileName ? { profile: lookups.instance.profileName } : {}), ...(lookups.instance.number ? { number: `+${lookups.instance.number}` } : {}), connection: EVOLUTION_STATE_LABELS[lookups.instance.state] }
            : { name: settings.instance, connection: "Não encontrada na Evolution" }
        : null
    return {
        status: settings.enabled ? "Ligado" : "Desligado",
        mode: SECRETARY_MODE_LABELS[settings.mode],
        instance: instance ?? "Nenhuma instância escolhida",
        models: {
            agent: { ...modelLabel(settings.main, lookups), ...(settings.main.temperature !== null ? { temperature: settings.main.temperature } : {}) },
            media: secondaryLabel(settings.media.model, lookups),
            analysis: secondaryLabel(settings.analysis.model, lookups),
            subjectDecision: secondaryLabel(settings.decision.model, lookups),
        },
        media: { readImages: yesNo(settings.media.readImages), transcribeAudio: yesNo(settings.media.transcribeAudio) },
        humanBehavior: {
            groupingSeconds: settings.human.groupingSeconds,
            delayMinSeconds: settings.human.delayMinSeconds,
            delayMaxSeconds: settings.human.delayMaxSeconds,
            showTyping: yesNo(settings.human.typing),
            splitMessages: yesNo(settings.human.splitMessages),
            markRead: yesNo(settings.human.markRead),
        },
        pauseWhenOwnerRepliesMinutes: settings.pauseMinutes,
        limits: { repliesPerConversationPerHour: settings.limits.repliesPerHour, dailyBudgetUsd: settings.limits.dailyBudgetUsd },
        estimatedPricesUsdPerMTok: prices,
        criteria: {
            summary: describeCriteria(settings.criteria, lookups.nameOf),
            audience: {
                whoCanBeAnswered: audience.mode === "selected" ? "Só os escolhidos" : "Todos",
                individualChats: yesNo(audience.direct),
                groups: yesNo(audience.groups),
                inGroups: audience.groupReply === "mention" ? "Só quando me mencionam" : "Sempre",
                selected: audience.selected.map(lookups.nameOf),
                neverAnswer: audience.blocked.map(lookups.nameOf),
            },
            subjects: {
                about: subjects.mode === "only" ? "Só os assuntos liberados" : "Qualquer assunto",
                blocked: subjects.blocked.map(subjectView),
                allowed: subjects.allowed.map(subjectView),
            },
        },
        readiness: secretaryReadiness(settings),
        secrets: secretsView(settings, lookups),
    }
}

/** Personalidade completa: base (fixos e extras) e variantes pela conversa, sem JID nem chave de bloco. */
export function buildPersonalityView(snapshot: PersonalitySnapshot, nameOf: (jid: string) => string) {
    return {
        base: snapshot.base.blocks.map((block) => ({ title: block.title, kind: isFixedBlock(block.key) ? "fixo" : "extra", content: block.content })),
        variants: snapshot.variants.map((variant) => ({ conversation: nameOf(variant.jid), title: variant.title, origin: variant.origin === "analysis" ? "Análise" : "Dono", blocks: variant.blocks.map((block) => ({ title: block.title, content: block.content })) })),
    }
}

/** Resumo para o retrato: blocos preenchidos e vazios e as variantes (sem os textos). */
export function summarizePersonality(snapshot: PersonalitySnapshot, nameOf: (jid: string) => string) {
    const filled = snapshot.base.blocks.filter((block) => block.content.trim())
    const fixedTitles = new Set(FIXED_BLOCKS.map((block) => block.title))
    return {
        filledBlocks: filled.map((block) => block.title),
        emptyFixedBlocks: snapshot.base.blocks.filter((block) => !block.content.trim() && fixedTitles.has(block.title)).map((block) => block.title),
        variants: snapshot.variants.map((variant) => ({ conversation: nameOf(variant.jid), title: variant.title, blocks: variant.blocks.filter((block) => block.content.trim()).length })),
        hint: "Para ler os textos, use get_secretary_personality.",
    }
}
