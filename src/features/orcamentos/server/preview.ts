import { dbConnect } from "@/lib/db"
import { AiUsageLog } from "@/lib/db/models/Ai"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { integrationDebug } from "@/lib/integrations/debug"
import { askJevSystemOne } from "@/lib/ai/jev"
import { describeAiError, streamAi, type AiStreamEvent } from "@/lib/ai/stream"
import type { AiProviderId } from "@/lib/ai/providers"
import { Project } from "@/lib/db/models/Project"
import type { IOrcamentoDraftPreview } from "@/lib/db/models/Orcamento"
import { generateTagsForInput } from "@/features/ai/server/task-tags"
import { loadBudgetPreviewSettings, availabilityOfBudgetPreview, loadEstimateHoursSettings, availabilityOfEstimateHours } from "@/features/ai/server/settings"
import type { BudgetPreviewSettings, EstimateHoursSettings } from "@/features/ai/schemas"
import type { DraftPreview } from "../schemas"
import {
    buildBudgetEstimateInstructions,
    buildBudgetEstimatePrompt,
    buildBudgetPreviewInstructions,
    buildBudgetPreviewPrompt,
    buildJevEstimateQuestions,
    JEV_ESTIMATE_QUESTION_ID,
    mapJevEstimateScore,
    parseDraftPreview,
    parseEstimateHours,
} from "../preview-prompt"
import type { DraftEstimateDto, DraftPreviewDto, DraftTagDto } from "../types"
import { findSimilarTasks } from "./similar"
import { getDraftDoc, saveDraftEstimate, saveDraftPreview, saveDraftTags } from "./portal"
import { resolveTagViews } from "./tag-views"
import type { ClienteOrcamentoDoc } from "./token"

/**
 * Prévia e estimativa da tarefa do portal (SOMENTE servidor), em DUAS fases:
 * 1. `runBudgetPreview` gera a prévia (título, tipo, prioridade, resumo e especificação técnica)
 *    com a feature "Orçamentos";
 * 2. `runBudgetEstimate` garante as **tags** do rascunho (feature "Tags de tarefas"), pré-busca as
 *    tarefas semelhantes por tags (com fallback por tipo/projeto) e estima o esforço numa **única
 *    chamada** (provedor de texto ou JEV) — sem agente/tools.
 * O `streamAi` é reusado e a saída (JSON) é validada com Zod antes de gravar no rascunho.
 */

const log = loggerFor({ module: "ai", feature: "budget-preview" })

export type BudgetPreviewEvent =
    | { type: "start"; provider: string; model: string }
    | { type: "delta"; text: string }
    | { type: "tool"; id: string; name: string; state: "running" | "done" | "error" }
    | { type: "notice"; message: string }
    | { type: "done"; preview: DraftPreviewDto }
    | { type: "error"; message: string }

export type BudgetEstimateEvent =
    | { type: "start"; provider: string; model: string }
    | { type: "delta"; text: string }
    | { type: "tool"; id: string; name: string; state: "running" | "done" | "error" }
    | { type: "notice"; message: string }
    | { type: "done"; estimate: DraftEstimateDto; tags: DraftTagDto[] }
    | { type: "error"; message: string }

type ResolvedSettings = BudgetPreviewSettings & { provider: NonNullable<BudgetPreviewSettings["provider"]>; model: string }
type ResolvedEstimateSettings = EstimateHoursSettings & { provider: AiProviderId; model: string }

export interface PreparedBudgetPreview {
    client: ClienteOrcamentoDoc
    draftId: string
    settings: ResolvedSettings
    instructions: string
    prompt: string
    title: string
}

export interface PreparedBudgetEstimate {
    client: ClienteOrcamentoDoc
    draftId: string
    projectId: string
    settings: ResolvedEstimateSettings
    preview: DraftPreviewDto
    input: { projectName: string; description: string; correction: string | null }
    title: string
}

/** Confere a configuração da prévia (erros viram resposta JSON antes de abrir o stream). */
async function requireSettings(): Promise<ResolvedSettings> {
    const { settings } = await loadBudgetPreviewSettings()
    const availability = await availabilityOfBudgetPreview(settings)
    if (!availability.available || !settings.provider || !settings.model) throw new DomainError(409, availability.reason ?? "Feature indisponível", "AI_FEATURE_UNAVAILABLE")
    return { ...settings, provider: settings.provider, model: settings.model }
}

/** Confere a configuração da estimativa (precisa de provedor e modelo). */
async function requireEstimateSettings(): Promise<ResolvedEstimateSettings> {
    const { settings } = await loadEstimateHoursSettings()
    const availability = await availabilityOfEstimateHours(settings)
    if (!availability.available || !settings.provider || !settings.model) throw new DomainError(409, availability.reason ?? "Feature indisponível", "AI_FEATURE_UNAVAILABLE")
    return { ...settings, provider: settings.provider, model: settings.model }
}

/** Prévia persistida no rascunho no formato aceito pelo prompt (sem tags/clareza). */
function draftPreviewInput(preview: IOrcamentoDraftPreview | null): DraftPreview | null {
    if (!preview) return null
    return {
        title: preview.title,
        taskType: (preview.taskType as DraftPreview["taskType"]) ?? null,
        priority: preview.priority as DraftPreview["priority"],
        technicalSpec: preview.technicalSpec,
        summary: preview.summary,
    }
}

/** Monta a entrada da fase 1 (prévia) ANTES de abrir o stream. */
export async function prepareBudgetPreview(client: ClienteOrcamentoDoc, draftId: string): Promise<PreparedBudgetPreview> {
    const settings = await requireSettings()
    const draft = await getDraftDoc(client, draftId)
    const project = await Project.findById(draft.projectId).lean()
    return {
        client,
        draftId,
        settings,
        instructions: buildBudgetPreviewInstructions(settings.instructions),
        prompt: buildBudgetPreviewPrompt({
            projectName: project?.name ?? draft.projectId,
            description: draft.description,
            correction: draft.correction ?? null,
            previousPreview: draftPreviewInput(draft.preview),
        }),
        title: `Orçamento ${client.name}`,
    }
}

/** Monta a entrada da fase 2 (estimativa): exige a prévia já gerada. */
export async function prepareBudgetEstimate(client: ClienteOrcamentoDoc, draftId: string): Promise<PreparedBudgetEstimate> {
    const settings = await requireEstimateSettings()
    const draft = await getDraftDoc(client, draftId)
    const stored = draft.preview
    if (!stored) throw new DomainError(409, "Gere a prévia antes de estimar", "DRAFT_WITHOUT_PREVIEW")
    const project = await Project.findById(draft.projectId).lean()
    const preview: DraftPreviewDto = {
        title: stored.title,
        taskType: (stored.taskType as DraftPreviewDto["taskType"]) ?? null,
        priority: stored.priority as DraftPreviewDto["priority"],
        technicalSpec: stored.technicalSpec,
        summary: stored.summary,
        tags: stored.tags ?? [],
    }
    return {
        client,
        draftId,
        projectId: draft.projectId,
        settings,
        preview,
        input: { projectName: project?.name ?? draft.projectId, description: draft.description, correction: draft.correction ?? null },
        title: `Orçamento ${client.name}`,
    }
}

/** Gera a prévia em streaming, valida o JSON e grava no rascunho ao final. */
export async function* runBudgetPreview(prepared: PreparedBudgetPreview, signal?: AbortSignal): AsyncGenerator<BudgetPreviewEvent> {
    const { settings } = prepared
    const dbg = integrationDebug("orcamentos")
    dbg.step(`[orcamentos] prévia do rascunho ${prepared.draftId} com ${settings.provider}/${settings.model}`, { promptChars: prepared.prompt.length })
    yield { type: "start", provider: settings.provider, model: settings.model }

    const startedAt = Date.now()
    let text = ""
    let last: AiStreamEvent | null = null
    for await (const event of streamAi({
        provider: settings.provider,
        model: settings.model,
        agent: settings.agent,
        variant: settings.variant,
        temperature: settings.temperature,
        maxOutputTokens: settings.maxOutputTokens,
        instructions: prepared.instructions,
        prompt: prepared.prompt,
        title: prepared.title,
        signal,
    })) {
        if (event.type === "delta") text += event.text
        if (event.type === "done" || event.type === "error") last = event
        if (event.type === "delta") yield { type: "delta", text: event.text }
        else if (event.type === "tool") yield { type: "tool", id: event.id, name: event.name, state: event.state }
        else if (event.type === "notice") yield { type: "notice", message: event.message }
        else if (event.type === "reasoning") yield { type: "notice", message: "Pensando…" }
    }

    if (last?.type === "error") {
        dbg.error(`[orcamentos] ${last.message}`)
        await logUsage("budget-preview", settings, prepared.client, prepared.draftId, false, last.message, startedAt, null)
        yield { type: "error", message: last.message }
        return
    }

    const preview = parseDraftPreview(text)
    if (!preview) {
        const message = "A IA não devolveu uma prévia válida. Tente novamente ou ajuste as instruções."
        dbg.error(`[orcamentos] ${message}`)
        await logUsage("budget-preview", settings, prepared.client, prepared.draftId, false, message, startedAt, last)
        yield { type: "error", message }
        return
    }

    await saveDraftPreview(prepared.client, prepared.draftId, { ...preview, taskType: preview.taskType ?? null })
    dbg.success(`[orcamentos] prévia do rascunho ${prepared.draftId} concluída`)
    await logUsage("budget-preview", settings, prepared.client, prepared.draftId, true, null, startedAt, last)
    yield { type: "done", preview: { ...preview, taskType: preview.taskType ?? null, tags: [] } }
}

/**
 * Estima as horas: garante as tags do rascunho, pré-busca tarefas semelhantes e faz UMA chamada
 * (`streamAi` ou JEV). Valida o resultado, calcula o orçamento do cliente e grava no rascunho.
 */
export async function* runBudgetEstimate(prepared: PreparedBudgetEstimate, signal?: AbortSignal): AsyncGenerator<BudgetEstimateEvent> {
    const { settings } = prepared
    const dbg = integrationDebug("orcamentos")
    dbg.step(`[orcamentos] estimativa do rascunho ${prepared.draftId} com ${settings.provider}/${settings.model}`)
    yield { type: "start", provider: settings.provider, model: settings.model }

    const startedAt = Date.now()
    let last: AiStreamEvent | null = null
    try {
        // 1) Tags do rascunho (feature "Tags de tarefas") — base para achar tarefas semelhantes.
        let tags = prepared.preview.tags
        if (tags.length === 0) {
            yield { type: "notice", message: "Classificando a tarefa…" }
            const generated = await generateTagsForInput({
                title: prepared.preview.title,
                description: prepared.input.description,
                taskType: prepared.preview.taskType,
                projectName: prepared.input.projectName,
                summary: prepared.preview.summary,
            }, `${String(prepared.client._id)}:${prepared.draftId}`)
            if (generated && generated.length) {
                tags = generated
                await saveDraftTags(prepared.client, prepared.draftId, generated)
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
            const response = await askJevSystemOne({ model: settings.model, state: prompt, questions: buildJevEstimateQuestions(), signal, tracking: { feature: "estimate-hours", subject: `${String(prepared.client._id)}:${prepared.draftId}` } })
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
                await logUsage("estimate-hours", settings, prepared.client, prepared.draftId, false, last.message, startedAt, null)
                yield { type: "error", message: last.message }
                return
            }
            const parsed = parseEstimateHours(text)
            if (parsed == null) {
                const message = "A IA não devolveu uma estimativa válida. Tente novamente."
                dbg.error(`[orcamentos] ${message}`)
                await logUsage("estimate-hours", settings, prepared.client, prepared.draftId, false, message, startedAt, last)
                yield { type: "error", message }
                return
            }
            hours = parsed
        }

        const estimate = await saveDraftEstimate(prepared.client, prepared.draftId, hours, `${settings.provider}/${settings.model}`)
        dbg.success(`[orcamentos] estimativa do rascunho ${prepared.draftId} concluída (${hours} h)`)
        await logUsage("estimate-hours", settings, prepared.client, prepared.draftId, true, null, startedAt, last)
        yield { type: "done", estimate, tags: await resolveTagViews(tags) }
    } catch (error) {
        const message = describeAiError(error)
        dbg.error(`[orcamentos] ${message}`)
        await logUsage("estimate-hours", settings, prepared.client, prepared.draftId, false, message, startedAt, last)
        yield { type: "error", message }
    }
}

async function logUsage(
    feature: string,
    settings: { provider: string; model: string },
    client: ClienteOrcamentoDoc,
    draftId: string,
    ok: boolean,
    error: string | null,
    startedAt: number,
    last: AiStreamEvent | null,
): Promise<void> {
    // O JEV registra a requisição na camada HTTP, inclusive se o processamento posterior falhar.
    if (settings.provider === "jev") return
    try {
        await dbConnect()
        const usage = last?.type === "done" ? last.usage : null
        await AiUsageLog.create({
            feature,
            provider: settings.provider,
            model: settings.model,
            subject: `${String(client._id)}:${draftId}`,
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
