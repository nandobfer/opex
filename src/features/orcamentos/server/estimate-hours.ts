import { dbConnect } from "@/lib/db"
import { AiUsageLog } from "@/lib/db/models/Ai"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { integrationDebug } from "@/lib/integrations/debug"
import { askJevSystemOne } from "@/lib/ai/jev"
import { describeAiError, streamAi, type AiStreamEvent, type AiUsage } from "@/lib/ai/stream"
import type { AiProviderId } from "@/lib/ai/providers"
import { generateTagsForInput } from "@/features/ai/server/task-tags"
import { availabilityOfEstimateHours, loadEstimateHoursSettings } from "@/features/ai/server/settings"
import type { EstimateHoursSettings } from "@/features/ai/schemas"
import type { DraftPreview } from "../schemas"
import {
    buildBudgetEstimateInstructions,
    buildBudgetEstimatePrompt,
    buildJevEstimateQuestions,
    JEV_ESTIMATE_QUESTION_ID,
    mapJevEstimateScore,
    parseEstimateHours,
} from "../preview-prompt"
import type { DraftPreviewDto } from "../types"
import { findSimilarTasks } from "./similar"

/**
 * Núcleo da estimativa por IA (SOMENTE servidor), **agnóstico de onde a estimativa será gravada**:
 * garante as tags da tarefa (feature "Tags de tarefas"), pré-busca as tarefas semelhantes por tags
 * (com fallback por tipo/projeto) e estima o esforço numa **única chamada** (provedor de texto ou
 * JEV) — sem agente/tools. É usado pelo **rascunho** (portal do cliente + prévia do dono) e pela
 * **tarefa existente** (aba Estimativa da página da tarefa).
 *
 * O `streamAi` é reusado e a saída (JSON) é validada com Zod antes de ser entregue pelo evento
 * `estimated`; a persistência e o cálculo do orçamento ficam com cada chamador.
 */

const log = loggerFor({ module: "ai", feature: "estimate-hours" })

export type ResolvedEstimateSettings = EstimateHoursSettings & { provider: AiProviderId; model: string }

/** Entrada da estimativa: o suficiente para montar o prompt e achar tarefas semelhantes. */
export interface PreparedEstimateHours {
    settings: ResolvedEstimateSettings
    projectId: string
    preview: DraftPreviewDto
    input: { projectName: string; description: string; correction: string | null }
    /** Título da sessão do OpenCode. */
    title: string
    /** Identificador do rastro de uso de IA (ex.: `owner:{draftId}` ou `task:{id}`). */
    subject: string
}

export type EstimateHoursEvent =
    | { type: "start"; provider: string; model: string }
    | { type: "delta"; text: string }
    | { type: "tool"; id: string; name: string; state: "running" | "done" | "error" }
    | { type: "notice"; message: string }
    | { type: "estimated"; hours: number; model: string; tags: string[]; usage: AiUsage | null }
    | { type: "error"; message: string }

/** Confere a configuração da estimativa (precisa de provedor e modelo; erro vira JSON antes do stream). */
export async function requireEstimateSettings(): Promise<ResolvedEstimateSettings> {
    const { settings } = await loadEstimateHoursSettings()
    const availability = await availabilityOfEstimateHours(settings)
    if (!availability.available || !settings.provider || !settings.model) throw new DomainError(409, availability.reason ?? "Feature indisponível", "AI_FEATURE_UNAVAILABLE")
    return { ...settings, provider: settings.provider, model: settings.model }
}

/** Registra o uso de IA (o JEV já é registrado na camada HTTP; provedores de texto entram aqui). */
export async function logUsage(feature: string, settings: { provider: string; model: string }, subject: string, ok: boolean, error: string | null, startedAt: number, usage: AiUsage | null): Promise<void> {
    if (settings.provider === "jev") return
    try {
        await dbConnect()
        await AiUsageLog.create({
            feature,
            provider: settings.provider,
            model: settings.model,
            subject,
            ok,
            error,
            inputTokens: usage?.inputTokens ?? null,
            outputTokens: usage?.outputTokens ?? null,
            totalTokens: usage?.totalTokens ?? null,
            costUsd: usage?.costUsd ?? null,
            durationMs: Date.now() - startedAt,
        })
    } catch (err) {
        log.warn({ err: err instanceof Error ? err.message : err }, "[ai] falha ao registrar uso")
    }
}

/**
 * Estima as horas numa única chamada. Emite o progresso (`notice`/`delta`/`tool`) e, ao concluir,
 * um evento `estimated` com as horas, o modelo e as tags usadas; o registro de uso de IA é feito
 * pelo chamador (sucesso após gravar; o núcleo registra apenas as falhas da geração).
 *
 * `onTags` permite ao rascunho persistir as tags geradas quando ainda não havia nenhuma.
 */
export async function* estimateHours(prepared: PreparedEstimateHours, hooks: { onTags?: (tags: string[]) => Promise<void> } = {}, signal?: AbortSignal): AsyncGenerator<EstimateHoursEvent> {
    const { settings } = prepared
    const dbg = integrationDebug("orcamentos")
    dbg.step(`[orcamentos] estimativa de ${prepared.subject} com ${settings.provider}/${settings.model}`)
    yield { type: "start", provider: settings.provider, model: settings.model }

    const startedAt = Date.now()
    let last: AiStreamEvent | null = null
    try {
        // 1) Tags (feature "Tags de tarefas") — base para achar tarefas semelhantes.
        let tags = prepared.preview.tags
        if (tags.length === 0) {
            yield { type: "notice", message: "Classificando a tarefa…" }
            const generated = await generateTagsForInput(
                {
                    title: prepared.preview.title,
                    description: prepared.input.description,
                    taskType: prepared.preview.taskType,
                    projectName: prepared.input.projectName,
                    summary: prepared.preview.summary,
                },
                prepared.subject,
            )
            if (generated && generated.length) {
                tags = generated
                if (hooks.onTags) await hooks.onTags(generated)
            }
        }

        // 2) Pré-busca de tarefas semelhantes (por tags; fallback por tipo/projeto).
        yield { type: "notice", message: "Buscando tarefas semelhantes…" }
        const similar = await findSimilarTasks({ tags, taskType: prepared.preview.taskType, projectId: prepared.projectId, limit: settings.similarLimit })
        const prompt = buildBudgetEstimatePrompt(prepared.preview as unknown as DraftPreview, prepared.input, similar)

        // 3) Estimativa: uma única chamada.
        let hours: number
        if (settings.provider === "jev") {
            yield { type: "notice", message: "Estimando com o JEV…" }
            const response = await askJevSystemOne({ model: settings.model, state: prompt, questions: buildJevEstimateQuestions(), signal, tracking: { feature: "estimate-hours", subject: prepared.subject } })
            const answer = response.answers?.[JEV_ESTIMATE_QUESTION_ID]
            if (!answer || answer.type !== "score") throw new Error("O JEV não devolveu a estimativa")
            hours = mapJevEstimateScore(answer.score)
        } else {
            const instructions = buildBudgetEstimateInstructions(settings.instructions)
            let text = ""
            for await (const event of streamAi({
                provider: settings.provider,
                model: settings.model,
                agent: settings.agent,
                variant: settings.variant,
                temperature: settings.temperature,
                maxOutputTokens: settings.maxOutputTokens,
                instructions,
                prompt,
                title: prepared.title,
                signal,
            })) {
                if (event.type === "delta") {
                    text += event.text
                    yield { type: "delta", text: event.text }
                } else if (event.type === "done" || event.type === "error") {
                    last = event
                } else if (event.type === "tool") yield { type: "tool", id: event.id, name: event.name, state: event.state }
                else if (event.type === "notice") yield { type: "notice", message: event.message }
                else if (event.type === "reasoning") yield { type: "notice", message: "Pensando…" }
            }
            if (last?.type === "error") {
                dbg.error(`[orcamentos] ${last.message}`)
                await logUsage("estimate-hours", settings, prepared.subject, false, last.message, startedAt, null)
                yield { type: "error", message: last.message }
                return
            }
            const parsed = parseEstimateHours(text)
            if (parsed == null) {
                const message = "A IA não devolveu uma estimativa válida. Tente novamente."
                dbg.error(`[orcamentos] ${message}`)
                await logUsage("estimate-hours", settings, prepared.subject, false, message, startedAt, null)
                yield { type: "error", message }
                return
            }
            hours = parsed
        }

        dbg.success(`[orcamentos] estimativa de ${prepared.subject} concluída (${hours} h)`)
        const usage = last?.type === "done" ? last.usage : null
        yield { type: "estimated", hours, model: `${settings.provider}/${settings.model}`, tags, usage }
    } catch (error) {
        const message = describeAiError(error)
        dbg.error(`[orcamentos] ${message}`)
        await logUsage("estimate-hours", settings, prepared.subject, false, message, startedAt, null)
        yield { type: "error", message }
    }
}
