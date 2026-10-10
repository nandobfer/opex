import { dbConnect } from "@/lib/db"
import { AiUsageLog } from "@/lib/db/models/Ai"
import { DevTask } from "@/lib/db/models/DevTask"
import { DomainError } from "@/lib/api/route"
import { integrationDebug } from "@/lib/integrations/debug"
import { loggerFor } from "@/lib/logger"
import { streamAi, type AiStreamEvent } from "@/lib/ai/stream"
import { concludedColumnKeys, getTask, publishTasksUpdated } from "@/features/tasks/server/service"
import { buildTaskSummaryInstructions, buildTaskSummaryPrompt, needsSummary, taskSummaryInputFromDetail, taskSummarySourceHash, toSummaryLine, type TaskSummarySource } from "../task-summary"
import type { TaskSummarySettings } from "../schemas"
import type { TaskSummaryEvent } from "../types"
import { availabilityOfTaskSummary, loadTaskSummarySettings } from "./settings"

const log = loggerFor({ module: "ai", feature: "task-summary" })

export interface PreparedTaskSummary {
    settings: TaskSummarySettings & { provider: NonNullable<TaskSummarySettings["provider"]>; model: string }
    taskId: string
    taskCode: string
    source: TaskSummarySource
    title: string
    instructions: string
    prompt: string
}

/**
 * Confere a configuração e monta a entrada ANTES de abrir o stream: feature indisponível (409) ou
 * tarefa inexistente (404) viram resposta JSON.
 */
export async function prepareTaskSummary(taskId: string): Promise<PreparedTaskSummary> {
    const { settings } = await loadTaskSummarySettings()
    const availability = await availabilityOfTaskSummary(settings)
    if (!availability.available || !settings.provider || !settings.model) throw new DomainError(409, availability.reason ?? "Feature indisponível", "AI_FEATURE_UNAVAILABLE")
    const task = await getTask(taskId)
    return {
        settings: { ...settings, provider: settings.provider, model: settings.model },
        taskId: task.id,
        taskCode: task.code,
        source: { title: task.title, description: task.description },
        title: `Resumo da tarefa ${task.code}`,
        instructions: buildTaskSummaryInstructions(settings),
        prompt: buildTaskSummaryPrompt(taskSummaryInputFromDetail(task)),
    }
}

/** Normaliza e grava o resumo da tarefa; devolve a linha salva (ou null se vazia). */
async function saveTaskSummary(taskId: string, source: TaskSummarySource, text: string, maxLength: number): Promise<string | null> {
    const line = toSummaryLine(text, maxLength)
    if (!line) return null
    await dbConnect()
    // `timestamps: false`: o resumo não é uma edição do usuário — não deve mexer no `updatedAt`
    // (nem fazer a sincronização do GitHub achar que a tarefa é mais nova que a issue).
    await DevTask.updateOne({ _id: taskId }, { $set: { summary: line, summarySourceHash: taskSummarySourceHash(source), summaryUpdatedAt: new Date() } }, { timestamps: false })
    await publishTasksUpdated([taskId])
    return line
}

async function logUsage(prepared: PreparedTaskSummary, last: AiStreamEvent | null, aborted: boolean, durationMs: number): Promise<void> {
    try {
        await dbConnect()
        await AiUsageLog.create({
            feature: "task-summary",
            provider: prepared.settings.provider,
            model: prepared.settings.model,
            subject: prepared.taskId,
            ok: last?.type === "done",
            error: last?.type === "error" ? last.message : aborted ? "cancelado" : null,
            inputTokens: last?.type === "done" ? last.usage.inputTokens : null,
            outputTokens: last?.type === "done" ? last.usage.outputTokens : null,
            totalTokens: last?.type === "done" ? last.usage.totalTokens : null,
            costUsd: last?.type === "done" ? last.usage.costUsd : null,
            durationMs,
        })
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : error }, "[ai] falha ao registrar uso")
    }
}

/**
 * Gera o resumo em streaming e o grava no `done`. O evento final (`done`/`error`) só é entregue
 * depois de persistir/publicar, para a tela refletir o resumo assim que o stream termina.
 */
export async function* runTaskSummary(prepared: PreparedTaskSummary, signal?: AbortSignal): AsyncGenerator<TaskSummaryEvent> {
    const { settings } = prepared
    const dbg = integrationDebug("ai")
    dbg.step(`[resumos-tarefas] ${prepared.title} com ${settings.provider}/${settings.model}`, { agent: settings.agent, variant: settings.variant, promptChars: prepared.prompt.length })
    yield { type: "start", provider: settings.provider, model: settings.model, agent: settings.agent }

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
        if (event.type === "delta") {
            text += event.text
            yield event
        } else if (event.type === "done" || event.type === "error") {
            last = event
        } else {
            yield event
        }
    }

    const aborted = signal?.aborted === true
    if (last?.type === "done") {
        await saveTaskSummary(prepared.taskId, prepared.source, text, settings.maxLength).catch((error) => {
            dbg.error(`[resumos-tarefas] falha ao gravar: ${error instanceof Error ? error.message : String(error)}`)
        })
        dbg.success(`[resumos-tarefas] concluído em ${last.durationMs} ms`, last.usage)
    } else if (last?.type === "error") {
        dbg.error(`[resumos-tarefas] ${last.message}`)
    } else if (aborted) {
        dbg.warn("[resumos-tarefas] cancelado pelo usuário")
    }

    await logUsage(prepared, last, aborted, Date.now() - startedAt)
    if (last) yield last
}

/** Gera o resumo de uma tarefa em segundo plano; no-op silencioso quando a feature está indisponível. */
export async function generateTaskSummary(taskId: string): Promise<string | null> {
    try {
        const prepared = await prepareTaskSummary(taskId)
        for await (const event of runTaskSummary(prepared)) {
            if (event.type === "error") return null
        }
        await dbConnect()
        const doc = await DevTask.findById(taskId).select({ summary: 1 }).lean()
        return doc?.summary ?? null
    } catch (error) {
        if (error instanceof DomainError) return null
        log.warn({ err: error instanceof Error ? error.message : error, taskId }, "[ai] falha ao gerar resumo da tarefa")
        return null
    }
}

/**
 * Rotina "Resumos de tarefas (IA)": enquanto a feature estiver ativa, gera os resumos que faltam
 * (ou que ficaram desatualizados) nas tarefas não concluídas — cobre o backfill do ativar e as
 * tarefas criadas pelo GitHub. Também roda ao ativar a feature.
 */
export async function runTaskSummaryBackfill(): Promise<string> {
    const { settings } = await loadTaskSummarySettings()
    const availability = await availabilityOfTaskSummary(settings)
    if (!availability.available) return "Pulada: resumos de tarefas indisponíveis"

    await dbConnect()
    const closed = await concludedColumnKeys()
    const filter: Record<string, unknown> = { archived: { $ne: true } }
    if (closed.length) filter.columnId = { $nin: closed }
    const docs = await DevTask.find(filter).select({ code: 1, title: 1, description: 1, summary: 1, summarySourceHash: 1 }).lean()
    const pending = docs.filter((task) =>
        needsSummary({ title: task.title, description: task.description ?? null, summary: task.summary ?? null, summarySourceHash: task.summarySourceHash ?? null }),
    )
    if (pending.length === 0) return "Nenhum resumo pendente"

    let created = 0
    let failed = 0
    for (const task of pending) {
        const summary = await generateTaskSummary(String(task._id))
        if (summary) created++
        else failed++
    }
    return `${created} resumo(s) gerado(s)${failed ? `, ${failed} falha(s)` : ""}`
}
