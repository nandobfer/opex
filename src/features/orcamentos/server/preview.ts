import { DomainError } from "@/lib/api/route"
import { integrationDebug } from "@/lib/integrations/debug"
import { streamAi, type AiStreamEvent } from "@/lib/ai/stream"
import { Project } from "@/lib/db/models/Project"
import { availabilityOfBudgetPreview, loadBudgetPreviewSettings } from "@/features/ai/server/settings"
import type { BudgetPreviewSettings } from "@/features/ai/schemas"
import type { DraftPreview } from "../schemas"
import { buildBudgetPreviewInstructions, buildBudgetPreviewPrompt, parseDraftPreview } from "../preview-prompt"
import type { DraftEstimateDto, DraftPreviewDto, DraftTagDto } from "../types"
import { estimateHours, logUsage, requireEstimateSettings, type EstimateHoursEvent, type ResolvedEstimateSettings } from "./estimate-hours"
import { getDraftDoc, saveDraftEstimate, saveDraftPreview, saveDraftTags, scopeSubject, scopeTitle, type DraftDoc, type DraftScope } from "./drafts"
import { resolveTagViews } from "./tag-views"

/**
 * Prévia e estimativa da tarefa do portal (SOMENTE servidor), em DUAS fases:
 * 1. `runBudgetPreview` gera a prévia (título, tipo, prioridade, resumo e especificação técnica)
 *    com a feature "Orçamentos";
 * 2. `runBudgetEstimate` roda o **núcleo compartilhado** de estimativa (`estimate-hours.ts`: tags +
 *    tarefas semelhantes + uma chamada de texto/JEV) e grava o resultado no rascunho.
 * O `streamAi` é reusado e a saída (JSON) é validada com Zod antes de gravar no rascunho.
 */

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

export interface PreparedBudgetPreview {
    scope: DraftScope
    draftId: string
    settings: ResolvedSettings
    instructions: string
    prompt: string
    title: string
}

export interface PreparedBudgetEstimate {
    scope: DraftScope
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

/** Prévia persistida no rascunho no formato aceito pelo prompt (sem tags/clareza). */
function draftPreviewInput(draft: DraftDoc): DraftPreview | null {
    const preview = draft.preview
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
export async function prepareBudgetPreview(scope: DraftScope, draftId: string): Promise<PreparedBudgetPreview> {
    const settings = await requireSettings()
    const draft = await getDraftDoc(scope, draftId)
    const project = await Project.findById(draft.projectId).lean()
    const projectName = project?.name ?? draft.projectId
    return {
        scope,
        draftId,
        settings,
        instructions: buildBudgetPreviewInstructions(settings.instructions),
        prompt: buildBudgetPreviewPrompt({
            projectName,
            description: draft.description,
            correction: draft.correction ?? null,
            previousPreview: draftPreviewInput(draft),
        }),
        title: scopeTitle(scope, projectName),
    }
}

/** Monta a entrada da fase 2 (estimativa): exige a prévia já gerada. */
export async function prepareBudgetEstimate(scope: DraftScope, draftId: string): Promise<PreparedBudgetEstimate> {
    const settings = await requireEstimateSettings()
    const draft = await getDraftDoc(scope, draftId)
    const stored = draft.preview
    if (!stored) throw new DomainError(409, "Gere a prévia antes de estimar", "DRAFT_WITHOUT_PREVIEW")
    const project = await Project.findById(draft.projectId).lean()
    const projectName = project?.name ?? draft.projectId
    const preview: DraftPreviewDto = {
        title: stored.title,
        taskType: (stored.taskType as DraftPreviewDto["taskType"]) ?? null,
        priority: stored.priority as DraftPreviewDto["priority"],
        technicalSpec: stored.technicalSpec,
        summary: stored.summary,
        tags: stored.tags ?? [],
    }
    return {
        scope,
        draftId,
        projectId: draft.projectId,
        settings,
        preview,
        input: { projectName, description: draft.description, correction: draft.correction ?? null },
        title: scopeTitle(scope, projectName),
    }
}

/** Gera a prévia em streaming, valida o JSON e grava no rascunho ao final. */
export async function* runBudgetPreview(prepared: PreparedBudgetPreview, signal?: AbortSignal): AsyncGenerator<BudgetPreviewEvent> {
    const { settings } = prepared
    const dbg = integrationDebug("orcamentos")
    const subject = scopeSubject(prepared.scope, prepared.draftId)
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
        await logUsage("budget-preview", settings, subject, false, last.message, startedAt, null)
        yield { type: "error", message: last.message }
        return
    }

    const preview = parseDraftPreview(text)
    if (!preview) {
        const message = "A IA não devolveu uma prévia válida. Tente novamente ou ajuste as instruções."
        dbg.error(`[orcamentos] ${message}`)
        await logUsage("budget-preview", settings, subject, false, message, startedAt, null)
        yield { type: "error", message }
        return
    }

    await saveDraftPreview(prepared.scope, prepared.draftId, { ...preview, taskType: preview.taskType ?? null })
    dbg.success(`[orcamentos] prévia do rascunho ${prepared.draftId} concluída`)
    await logUsage("budget-preview", settings, subject, true, null, startedAt, last?.type === "done" ? last.usage : null)
    yield { type: "done", preview: { ...preview, taskType: preview.taskType ?? null, tags: [] } }
}

/**
 * Estima as horas do rascunho pelo núcleo compartilhado e grava o resultado (horas + modelo).
 * Garante as tags do rascunho (persistindo as geradas) e devolve o `done` com a estimativa e as tags.
 */
export async function* runBudgetEstimate(prepared: PreparedBudgetEstimate, signal?: AbortSignal): AsyncGenerator<BudgetEstimateEvent> {
    const { settings } = prepared
    const dbg = integrationDebug("orcamentos")
    const subject = scopeSubject(prepared.scope, prepared.draftId)
    const startedAt = Date.now()

    let estimated: Extract<EstimateHoursEvent, { type: "estimated" }> | null = null
    for await (const event of estimateHours(
        {
            settings,
            projectId: prepared.projectId,
            preview: prepared.preview,
            input: prepared.input,
            title: prepared.title,
            subject,
        },
        { onTags: (tags) => saveDraftTags(prepared.scope, prepared.draftId, tags) },
        signal,
    )) {
        if (event.type === "estimated") {
            estimated = event
            continue
        }
        yield event
    }
    if (!estimated) return

    try {
        const estimate = await saveDraftEstimate(prepared.scope, prepared.draftId, estimated.hours, estimated.model)
        dbg.success(`[orcamentos] estimativa do rascunho ${prepared.draftId} concluída (${estimated.hours} h)`)
        await logUsage("estimate-hours", settings, subject, true, null, startedAt, estimated.usage)
        yield { type: "done", estimate, tags: await resolveTagViews(estimated.tags) }
    } catch (error) {
        const message = error instanceof Error ? error.message : "Falha ao salvar a estimativa"
        dbg.error(`[orcamentos] ${message}`)
        await logUsage("estimate-hours", settings, subject, false, message, startedAt, null)
        yield { type: "error", message }
    }
}
