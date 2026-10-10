import { dbConnect } from "@/lib/db"
import { AiUsageLog } from "@/lib/db/models/Ai"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { integrationDebug } from "@/lib/integrations/debug"
import { streamAi, type AiStreamEvent } from "@/lib/ai/stream"
import { Project } from "@/lib/db/models/Project"
import { loadBudgetPreviewSettings, availabilityOfBudgetPreview } from "@/features/ai/server/settings"
import type { BudgetPreviewSettings } from "@/features/ai/schemas"
import type { DraftPreview } from "../schemas"
import {
    buildBudgetEstimateInstructions,
    buildBudgetEstimatePrompt,
    buildBudgetPreviewInstructions,
    buildBudgetPreviewPrompt,
    parseDraftPreview,
    parseEstimateHours,
    type EstimateStats,
} from "../preview-prompt"
import type { DraftEstimateDto, DraftPreviewDto } from "../types"
import { estimateStats } from "./estimate"
import { getDraftDoc, saveDraftEstimate, saveDraftPreview } from "./portal"
import type { ClienteOrcamentoDoc } from "./token"

/**
 * Prévia e estimativa da tarefa do portal (SOMENTE servidor), em DUAS fases:
 * 1. `runBudgetPreview` gera a prévia (título, tipo, prioridade, resumo e especificação técnica);
 * 2. `runBudgetEstimate` estima as horas a partir da prévia + histórico de horas dos agentes.
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
    | { type: "done"; estimate: DraftEstimateDto }
    | { type: "error"; message: string }

type ResolvedSettings = BudgetPreviewSettings & { provider: NonNullable<BudgetPreviewSettings["provider"]>; model: string }

export interface PreparedBudgetPreview {
    client: ClienteOrcamentoDoc
    draftId: string
    settings: ResolvedSettings
    instructions: string
    prompt: string
    title: string
}

export type PreparedBudgetEstimate = PreparedBudgetPreview

/** Confere a configuração exigida (erros viram resposta JSON antes de abrir o stream). */
async function requireSettings(): Promise<ResolvedSettings> {
    const { settings } = await loadBudgetPreviewSettings()
    const availability = await availabilityOfBudgetPreview(settings)
    if (!availability.available || !settings.provider || !settings.model) throw new DomainError(409, availability.reason ?? "Feature indisponível", "AI_FEATURE_UNAVAILABLE")
    return { ...settings, provider: settings.provider, model: settings.model }
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
        prompt: buildBudgetPreviewPrompt({ projectName: project?.name ?? draft.projectId, description: draft.description, correction: draft.correction ?? null }),
        title: `Orçamento ${client.name}`,
    }
}

/** Monta a entrada da fase 2 (estimativa): exige a prévia já gerada. */
export async function prepareBudgetEstimate(client: ClienteOrcamentoDoc, draftId: string): Promise<PreparedBudgetEstimate> {
    const settings = await requireSettings()
    const draft = await getDraftDoc(client, draftId)
    if (!draft.preview) throw new DomainError(409, "Gere a prévia antes de estimar", "DRAFT_WITHOUT_PREVIEW")
    const project = await Project.findById(draft.projectId).lean()
    const stats: EstimateStats = await estimateStats()
    return {
        client,
        draftId,
        settings,
        instructions: buildBudgetEstimateInstructions(settings.instructions),
        prompt: buildBudgetEstimatePrompt(
            draft.preview as unknown as DraftPreview,
            { projectName: project?.name ?? draft.projectId, description: draft.description, correction: draft.correction ?? null },
            stats,
        ),
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
        await logUsage(settings, prepared.client, prepared.draftId, false, last.message, startedAt, null)
        yield { type: "error", message: last.message }
        return
    }

    const preview = parseDraftPreview(text)
    if (!preview) {
        const message = "A IA não devolveu uma prévia válida. Tente novamente ou ajuste as instruções."
        dbg.error(`[orcamentos] ${message}`)
        await logUsage(settings, prepared.client, prepared.draftId, false, message, startedAt, last)
        yield { type: "error", message }
        return
    }

    await saveDraftPreview(prepared.client, prepared.draftId, { ...preview, taskType: preview.taskType ?? null }, `${settings.provider}/${settings.model}`)
    dbg.success(`[orcamentos] prévia do rascunho ${prepared.draftId} concluída`)
    await logUsage(settings, prepared.client, prepared.draftId, true, null, startedAt, last)
    yield { type: "done", preview: { ...preview, taskType: preview.taskType ?? null } }
}

/** Estima as horas em streaming, valida o JSON, calcula o orçamento e grava no rascunho. */
export async function* runBudgetEstimate(prepared: PreparedBudgetEstimate, signal?: AbortSignal): AsyncGenerator<BudgetEstimateEvent> {
    const { settings } = prepared
    const dbg = integrationDebug("orcamentos")
    dbg.step(`[orcamentos] estimativa do rascunho ${prepared.draftId} com ${settings.provider}/${settings.model}`, { promptChars: prepared.prompt.length })
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
        await logUsage(settings, prepared.client, prepared.draftId, false, last.message, startedAt, null)
        yield { type: "error", message: last.message }
        return
    }

    const hours = parseEstimateHours(text)
    if (hours == null) {
        const message = "A IA não devolveu uma estimativa válida. Tente novamente."
        dbg.error(`[orcamentos] ${message}`)
        await logUsage(settings, prepared.client, prepared.draftId, false, message, startedAt, last)
        yield { type: "error", message }
        return
    }

    const estimate = await saveDraftEstimate(prepared.client, prepared.draftId, hours)
    dbg.success(`[orcamentos] estimativa do rascunho ${prepared.draftId} concluída (${hours} h)`)
    await logUsage(settings, prepared.client, prepared.draftId, true, null, startedAt, last)
    yield { type: "done", estimate }
}

async function logUsage(
    settings: PreparedBudgetPreview["settings"],
    client: ClienteOrcamentoDoc,
    draftId: string,
    ok: boolean,
    error: string | null,
    startedAt: number,
    last: AiStreamEvent | null,
): Promise<void> {
    try {
        await dbConnect()
        const usage = last?.type === "done" ? last.usage : null
        await AiUsageLog.create({
            feature: "budget-preview",
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
