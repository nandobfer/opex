import { streamAi } from "@/lib/ai/stream"
import type { AiProviderId } from "@/lib/ai/providers"
import { loggerFor } from "@/lib/logger"
import { OPEX_CLIENT_TITLE_CONSUMPTION_ORIGIN, OPEX_DEFAULT_TITLE, OPEX_SUMMARY_MAX, OPEX_TITLE_CONSUMPTION_ORIGIN, OPEX_TITLE_MAX } from "../constants"
import { parseTitleOutput, fallbackTitle } from "../title"
import type { OpexAgentSettings } from "../schemas"
import { OpexSession } from "@/lib/db/models/Opex"
import { publishSessionUpdated } from "./sessions"
import { OWNER_SCOPE, type OpexServerScope } from "./scope"

const log = loggerFor({ module: "opex-agent", feature: "title" })

export interface TitleTurn {
    userText: string
    assistantText: string
    tools: string[]
}

function buildPrompt(current: { title: string; summary: string; titleSource: string }, turn: TitleTurn): string {
    return [
        `Título atual: ${current.title === OPEX_DEFAULT_TITLE ? "(nenhum)" : current.title}`,
        `Resumo atual: ${current.summary || "(nenhum)"}`,
        current.titleSource === "manual" ? "O usuário definiu o título manualmente: repita o título atual sem mudar." : "",
        "",
        "Último turno:",
        `Usuário: ${turn.userText.slice(0, 4000)}`,
        turn.tools.length ? `Ferramentas usadas pelo assistente: ${[...new Set(turn.tools)].join(", ")}` : "",
        `Assistente: ${turn.assistantText.slice(0, 6000) || "(sem texto)"}`,
    ]
        .filter((line) => line !== "")
        .join("\n")
}

/**
 * Subagente de título e resumo: roda depois de cada turno com o provedor próprio (ou o do agente
 * principal). Falha nunca afeta o turno; no primeiro turno, sem resposta válida, o título vira o
 * começo da mensagem do usuário.
 */
export async function refreshSessionTitle(sessionId: string, settings: OpexAgentSettings, turn: TitleTurn, scope: OpexServerScope = OWNER_SCOPE): Promise<void> {
    const model = settings.title.provider && settings.title.model ? settings.title : settings.main
    await refreshSessionTitleWith(
        sessionId,
        { provider: model.provider, model: model.model, variant: model.variant, instructions: settings.titleInstructions, origin: scope.kind === "client" ? OPEX_CLIENT_TITLE_CONSUMPTION_ORIGIN : OPEX_TITLE_CONSUMPTION_ORIGIN },
        turn,
    )
}

export interface TitleModel {
    provider: AiProviderId | null
    model: string | null
    variant: string | null
    instructions: string
    /** Origem do consumo (painel de consumo). */
    origin: string
}

/** Mesmo subagente com o modelo informado (o Agente Maddox usa o OpenCode). */
export async function refreshSessionTitleWith(sessionId: string, model: TitleModel, turn: TitleTurn): Promise<void> {
    const session = await OpexSession.findById(sessionId).lean()
    if (!session) return
    let text = ""
    let error: string | null = null
    if (model.provider && model.model) {
        for await (const event of streamAi({
            provider: model.provider,
            model: model.model,
            variant: model.variant,
            instructions: model.instructions,
            prompt: buildPrompt(session, turn),
            consumption: { origin: model.origin, subject: sessionId },
        })) {
            if (event.type === "delta") text += event.text
            if (event.type === "error") error = event.message
        }
    }
    const parsed = error ? null : parseTitleOutput(text)
    if (!parsed) {
        if (error || text) log.info({ sessionId, err: error ?? "resposta inválida" }, "[opex] título/resumo não gerado")
        if (session.title !== OPEX_DEFAULT_TITLE || session.titleSource === "manual") return
        await OpexSession.updateOne({ _id: session._id }, { $set: { title: fallbackTitle(turn.userText) } })
        await publishSessionUpdated(sessionId)
        return
    }
    const $set: Record<string, string> = { summary: parsed.summary.slice(0, OPEX_SUMMARY_MAX) }
    if (session.titleSource !== "manual") $set.title = parsed.title.slice(0, OPEX_TITLE_MAX)
    await OpexSession.updateOne({ _id: session._id }, { $set })
    await publishSessionUpdated(sessionId)
}
