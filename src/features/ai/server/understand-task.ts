import { dbConnect } from "@/lib/db"
import { AiUsageLog } from "@/lib/db/models/Ai"
import { DomainError } from "@/lib/api/route"
import { integrationDebug } from "@/lib/integrations/debug"
import { loggerFor } from "@/lib/logger"
import { streamAi, type AiStreamEvent } from "@/lib/ai/stream"
import { getTask } from "@/features/tasks/server/service"
import { buildUnderstandTaskInstructions, buildUnderstandTaskPrompt } from "../understand-task"
import type { UnderstandTaskSettings } from "../schemas"
import type { UnderstandTaskEvent } from "../types"
import { availabilityOf, loadUnderstandTaskSettings } from "./settings"

const log = loggerFor({ module: "ai", feature: "understand-task" })

export interface PreparedUnderstandTask {
    settings: UnderstandTaskSettings & { provider: NonNullable<UnderstandTaskSettings["provider"]>; model: string }
    taskId: string
    title: string
    instructions: string
    prompt: string
}

/**
 * Confere a configuração e monta a entrada ANTES de abrir o stream: feature indisponível (409) ou
 * tarefa inexistente (404) viram resposta JSON.
 */
export async function prepareUnderstandTask(taskId: string): Promise<PreparedUnderstandTask> {
    const { settings } = await loadUnderstandTaskSettings()
    const availability = await availabilityOf(settings)
    if (!availability.available || !settings.provider || !settings.model) throw new DomainError(409, availability.reason ?? "Feature indisponível", "AI_FEATURE_UNAVAILABLE")
    const base = { settings: { ...settings, provider: settings.provider, model: settings.model }, instructions: buildUnderstandTaskInstructions(settings) }

    const task = await getTask(taskId)
    return { ...base, taskId: task.id, title: `Entender tarefa ${task.code}`, prompt: buildUnderstandTaskPrompt(task, settings.include) }
}

/** Gera a explicação em streaming e registra o uso ao final (sem guardar o texto gerado). */
export async function* runUnderstandTask(prepared: PreparedUnderstandTask, signal?: AbortSignal): AsyncGenerator<UnderstandTaskEvent> {
    const { settings } = prepared
    const dbg = integrationDebug("ai")
    dbg.step(`[entender-tarefas] ${prepared.title} com ${settings.provider}/${settings.model}`, { agent: settings.agent, variant: settings.variant, promptChars: prepared.prompt.length })
    yield { type: "start", provider: settings.provider, model: settings.model, agent: settings.agent }

    const startedAt = Date.now()
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
        if (event.type === "done" || event.type === "error") last = event
        if (event.type === "tool") dbg.info(`[entender-tarefas] ferramenta ${event.name}: ${event.state}`)
        yield event
    }

    const aborted = signal?.aborted === true
    if (last?.type === "done") dbg.success(`[entender-tarefas] concluído em ${last.durationMs} ms`, last.usage)
    else if (last?.type === "error") dbg.error(`[entender-tarefas] ${last.message}`)
    else if (aborted) dbg.warn("[entender-tarefas] cancelado pelo usuário")

    try {
        await dbConnect()
        await AiUsageLog.create({
            feature: "understand-task",
            provider: settings.provider,
            model: settings.model,
            subject: prepared.taskId,
            ok: last?.type === "done",
            error: last?.type === "error" ? last.message : aborted ? "cancelado" : null,
            inputTokens: last?.type === "done" ? last.usage.inputTokens : null,
            outputTokens: last?.type === "done" ? last.usage.outputTokens : null,
            totalTokens: last?.type === "done" ? last.usage.totalTokens : null,
            costUsd: last?.type === "done" ? last.usage.costUsd : null,
            durationMs: Date.now() - startedAt,
        })
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : error }, "[ai] falha ao registrar uso")
    }
}
