import { z } from "zod"

/**
 * Plano dos canais extras do subagente de provisionamento (OPE-130, módulo PURO). O modelo lê o
 * objetivo, as instruções e os canais existentes e responde um JSON; aqui ele é validado e corrigido:
 * - canal inexistente em `subscribe` é descartado (com aviso);
 * - `create` com slug que já existe vira **assinatura** do existente (nunca recria);
 * - canais base (`opex`, global dos rotineiros, canal próprio) nunca entram nem saem por aqui;
 * - canais de outros agentes (`agentes/...`) ficam fora: o rotineiro não lê a memória privada deles.
 */

export const CHANNEL_SLUG = /^[a-z0-9]+(?:[-_][a-z0-9]+)*(?:\/[a-z0-9]+(?:[-_][a-z0-9]+)*)*$/
export const MAX_EXTRA_CHANNELS = 8

const answerSchema = z.object({
    subscribe: z.array(z.object({ channel: z.string(), reason: z.string().default("") })).default([]),
    create: z.array(z.object({ slug: z.string(), name: z.string().default(""), description: z.string().default(""), reason: z.string().default("") })).default([]),
})

export interface ExtraChannelPlanItem {
    channel: string
    name: string
    description: string
    reason: string
    /** Canal novo a criar (o subagente não achou um adequado). */
    create: boolean
}

export interface ExtraChannelPlan {
    items: ExtraChannelPlanItem[]
    warnings: string[]
}

/** Canais que o rotineiro pode assinar (fora `opex` e os privados dos agentes). */
export function isEligibleExtraChannel(slug: string): boolean {
    return CHANNEL_SLUG.test(slug) && slug !== "opex" && !slug.startsWith("agentes/") && slug.length <= 120
}

/** Primeiro objeto JSON do texto (aceita bloco ```json```). */
export function extractJsonObject(text: string): unknown {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
    const body = fenced?.[1] ?? text
    const start = body.indexOf("{")
    const end = body.lastIndexOf("}")
    if (start < 0 || end <= start) return null
    try {
        return JSON.parse(body.slice(start, end + 1))
    } catch {
        return null
    }
}

export function parseExtraChannelPlan(text: string, existing: readonly { slug: string; name: string }[], alreadyExtra: readonly string[] = []): ExtraChannelPlan {
    const raw = extractJsonObject(text)
    const parsed = answerSchema.safeParse(raw ?? {})
    if (!raw || !parsed.success) throw new Error("O subagente de provisionamento não devolveu um JSON válido")
    const known = new Map(existing.map((channel) => [channel.slug, channel.name]))
    const warnings: string[] = []
    const items: ExtraChannelPlanItem[] = []
    const seen = new Set<string>(alreadyExtra)
    const push = (item: ExtraChannelPlanItem) => {
        if (seen.has(item.channel) || items.length >= MAX_EXTRA_CHANNELS) return
        seen.add(item.channel)
        items.push(item)
    }
    for (const entry of parsed.data.subscribe) {
        const slug = entry.channel.trim()
        if (!known.has(slug)) {
            warnings.push(`Canal "${slug}" não existe no Engramind: ignorado.`)
            continue
        }
        if (!isEligibleExtraChannel(slug)) continue
        push({ channel: slug, name: known.get(slug) ?? slug, description: "", reason: entry.reason.trim() || "Relacionado ao objetivo do agente", create: false })
    }
    for (const entry of parsed.data.create) {
        const slug = entry.slug.trim().toLowerCase()
        if (!isEligibleExtraChannel(slug)) {
            warnings.push(`Canal novo "${slug}" com slug inválido ou reservado: ignorado.`)
            continue
        }
        const exists = known.has(slug)
        push({ channel: slug, name: exists ? (known.get(slug) ?? slug) : entry.name.trim() || slug, description: entry.description.trim(), reason: entry.reason.trim() || "Canal novo para o objetivo do agente", create: !exists })
    }
    return { items, warnings }
}

/** Prompt do subagente (sem segredos: só nome, objetivo, instruções e a lista de canais). */
export function extraChannelPrompt(agent: { name: string; objective: string; instructions: string }, channels: readonly { slug: string; name: string; description: string | null }[], current: readonly string[]): string {
    const list = channels.filter((channel) => isEligibleExtraChannel(channel.slug))
    return [
        `Agente rotineiro: ${agent.name}`,
        `Objetivo: ${agent.objective}`,
        agent.instructions.trim() ? `Instruções:\n${agent.instructions.trim().slice(0, 6000)}` : "",
        "",
        "Canais de memória existentes no Engramind (slug — nome — descrição):",
        list.length ? list.map((channel) => `- ${channel.slug} — ${channel.name}${channel.description ? ` — ${channel.description}` : ""}`).join("\n") : "- (nenhum)",
        current.length ? `\nJá assinados como extras: ${current.join(", ")}` : "",
    ]
        .filter((line) => line !== "")
        .join("\n")
}

export const EXTRA_CHANNELS_INSTRUCTIONS = [
    "Você é o subagente de provisionamento dos agentes rotineiros do Opex.",
    "Decida quais canais de memória EXTRAS o agente deve assinar, além dos canais base (que ele já assina).",
    "Assine canais existentes cujo assunto ajude o objetivo. Só crie um canal novo quando nenhum existente servir e o assunto for reaproveitável por outros agentes (ex.: \"vagas/empresa-x\").",
    "Slugs: minúsculas, números, hífen, sublinhado e barras (ex.: \"vagas/empresa-x\"); nunca comece com \"agentes/\" nem use \"opex\".",
    `No máximo ${MAX_EXTRA_CHANNELS} canais. Pode não escolher nenhum.`,
    'Responda SOMENTE um JSON: {"subscribe":[{"channel":"slug","reason":"motivo curto em pt-BR"}],"create":[{"slug":"slug","name":"Nome","description":"Descrição","reason":"motivo curto"}]}',
].join("\n")
