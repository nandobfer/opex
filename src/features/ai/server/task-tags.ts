import { dbConnect } from "@/lib/db"
import { AiUsageLog } from "@/lib/db/models/Ai"
import { DevTask } from "@/lib/db/models/DevTask"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import type { CronJobScope } from "@/lib/integrations/catalog"
import { integrationDebug } from "@/lib/integrations/debug"
import { AiProviderError } from "@/lib/ai/errors"
import { askJevSystemOne } from "@/lib/ai/jev"
import { streamAi, type AiStreamEvent } from "@/lib/ai/stream"
import { concludedColumnKeys, getTask, publishTasksUpdated } from "@/features/tasks/server/service"
import type { TaskTagDef } from "@/features/tasks/tags"
import { buildJevTagQuestions, buildTaskTagsInstructions, buildTaskTagsPrompt, needsTags, parseTaskTags, selectJevTags, taskTagsSourceHash, type TaskTagsInput, type TaskTagsSource } from "../task-tags"
import type { TaskTagsSettings } from "../schemas"
import { availabilityOfTaskTags, loadTaskTagsSettings } from "./settings"

const log = loggerFor({ module: "ai", feature: "task-tags" })

export interface PreparedTaskTags {
    settings: TaskTagsSettings & { provider: NonNullable<TaskTagsSettings["provider"]>; model: string }
    taskId: string
    taskCode: string
    source: TaskTagsSource
    input: TaskTagsInput
    taxonomy: TaskTagDef[]
}

/**
 * Confere a configuração e monta a entrada ANTES de gerar: feature indisponível (409) ou tarefa
 * inexistente (404) viram resposta JSON.
 */
export async function prepareTaskTags(taskId: string): Promise<PreparedTaskTags> {
    const { settings } = await loadTaskTagsSettings()
    const availability = await availabilityOfTaskTags(settings)
    if (!availability.available || !settings.provider || !settings.model) throw new DomainError(409, availability.reason ?? "Feature indisponível", "AI_FEATURE_UNAVAILABLE")
    const task = await getTask(taskId)
    return {
        settings: { ...settings, provider: settings.provider, model: settings.model },
        taskId: task.id,
        taskCode: task.code,
        source: { title: task.title, description: task.description },
        input: { title: task.title, description: task.description, taskType: task.taskType, projectName: task.project?.name ?? null, summary: task.summary },
        taxonomy: settings.taxonomy,
    }
}

async function logUsage(feature: string, provider: string, model: string, taskId: string, ok: boolean, error: string | null, startedAt: number, usage: { inputTokens?: number | null; outputTokens?: number | null; totalTokens?: number | null; costUsd?: number | null } | null): Promise<void> {
    try {
        await dbConnect()
        await AiUsageLog.create({
            feature,
            provider,
            model,
            subject: taskId,
            ok,
            error,
            inputTokens: usage?.inputTokens ?? null,
            outputTokens: usage?.outputTokens ?? null,
            totalTokens: usage?.totalTokens ?? null,
            costUsd: usage?.costUsd ?? null,
            durationMs: Date.now() - startedAt,
        })
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : error }, "[ai] falha ao registrar uso")
    }
}

/** Resolve as tags: JEV (uma pergunta `noul` por tag) ou provedor de texto (JSON validado). */
async function resolveTags(prepared: PreparedTaskTags): Promise<{ tags: string[]; streamed: AiStreamEvent | null }> {
    const { settings, taxonomy, input } = prepared
    if (settings.provider === "jev") {
        const response = await askJevSystemOne({ model: settings.model, state: buildTaskTagsPrompt(input), questions: buildJevTagQuestions(taxonomy), tracking: { feature: "task-tags", subject: prepared.taskId || null } })
        return { tags: selectJevTags(response.answers, taxonomy, settings.jevThreshold, settings.maxTags), streamed: null }
    }
    if (settings.provider === "gemini" || settings.provider === "opencode") {
        let text = ""
        let last: AiStreamEvent | null = null
        for await (const event of streamAi({
            provider: settings.provider,
            model: settings.model,
            agent: settings.agent,
            variant: settings.variant,
            temperature: settings.temperature,
            maxOutputTokens: settings.maxOutputTokens,
            instructions: buildTaskTagsInstructions(settings, taxonomy, settings.maxTags),
            prompt: buildTaskTagsPrompt(input),
            title: `Tags da tarefa ${prepared.taskCode}`,
        })) {
            if (event.type === "delta") text += event.text
            if (event.type === "done" || event.type === "error") last = event
        }
        if (last?.type === "error") throw new AiProviderError(last.message)
        const tags = parseTaskTags(text, taxonomy, settings.maxTags)
        if (tags === null) throw new AiProviderError("A IA não devolveu tags válidas")
        return { tags, streamed: last }
    }
    throw new AiProviderError("Provedor não suportado para tags de tarefas")
}

/** Gera as tags da tarefa a partir da entrada preparada e as grava (sem mexer no `updatedAt`). */
export async function runTaskTags(prepared: PreparedTaskTags): Promise<string[]> {
    const startedAt = Date.now()
    const dbg = integrationDebug("ai")
    const { tags, streamed } = await resolveTags(prepared)
    await dbConnect()
    await DevTask.updateOne({ _id: prepared.taskId }, { $set: { tags, tagsSourceHash: taskTagsSourceHash(prepared.source), tagsUpdatedAt: new Date() } }, { timestamps: false })
    await publishTasksUpdated([prepared.taskId])
    if (prepared.settings.provider !== "jev") await logUsage("task-tags", prepared.settings.provider, prepared.settings.model, prepared.taskId, true, null, startedAt, streamed?.type === "done" ? streamed.usage : null)
    dbg.success(`[tags-tarefas] ${prepared.taskCode} concluído (${tags.length} tag(s))`)
    return tags
}

/** Gera as tags de uma tarefa em segundo plano; no-op silencioso quando a feature está indisponível. */
export async function generateTaskTags(taskId: string): Promise<string[] | null> {
    try {
        const prepared = await prepareTaskTags(taskId)
        integrationDebug("ai").step(`[tags-tarefas] ${prepared.taskCode} com ${prepared.settings.provider}/${prepared.settings.model}`, { taxonomy: prepared.taxonomy.length, promptChars: prepared.input.description?.length ?? 0 })
        return await runTaskTags(prepared)
    } catch (error) {
        if (error instanceof DomainError) return null
        const message = error instanceof Error ? error.message : "Falha ao gerar tags da tarefa"
        log.warn({ err: message, taskId }, "[ai] falha ao gerar tags da tarefa")
        return null
    }
}

/**
 * Gera tags a partir de uma entrada avulsa (ex.: a prévia do portal, que ainda não é uma tarefa).
 * Carrega a configuração da feature; `null` quando indisponível ou em falha.
 */
export async function generateTagsForInput(input: TaskTagsInput, subject: string | null = null): Promise<string[] | null> {
    try {
        const { settings } = await loadTaskTagsSettings()
        const availability = await availabilityOfTaskTags(settings)
        if (!availability.available || !settings.provider || !settings.model) return null
        const prepared: PreparedTaskTags = {
            settings: { ...settings, provider: settings.provider, model: settings.model },
            taskId: subject ?? "",
            taskCode: input.title,
            source: { title: input.title, description: input.description },
            input,
            taxonomy: settings.taxonomy,
        }
        const { tags } = await resolveTags(prepared)
        return tags
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : error }, "[ai] falha ao gerar tags para a entrada")
        return null
    }
}

/** Tarefas que casam com o filtro; com `onlyPending`, só as que precisam de tags (sem hash ou desatualizadas). */
async function findTasksForTags(filter: Record<string, unknown>, onlyPending: boolean) {
    await dbConnect()
    const docs = await DevTask.find(filter).select({ code: 1, title: 1, description: 1, tagsSourceHash: 1 }).lean()
    if (!onlyPending) return docs
    return docs.filter((task) => needsTags({ title: task.title, description: task.description ?? null, tagsSourceHash: task.tagsSourceHash ?? null }))
}

/** Gera as tags das tarefas informadas, em sequência, e resume o resultado. */
async function tagTasks(tasks: readonly { _id: unknown }[]): Promise<string> {
    let created = 0
    let failed = 0
    for (const task of tasks) {
        const tags = await generateTaskTags(String(task._id))
        if (tags) created++
        else failed++
    }
    return `${created} tarefa(s) marcada(s)${failed ? `, ${failed} falha(s)` : ""}`
}

/**
 * Rotina "Tags de tarefas (IA)": enquanto a feature estiver ativa, gera as tags que faltam (ou
 * ficaram desatualizadas) nas tarefas não concluídas — cobre o backfill do ativar e as tarefas
 * criadas pelo GitHub. Também roda ao ativar a feature.
 */
export async function runTaskTagsBackfill(): Promise<string> {
    const { settings } = await loadTaskTagsSettings()
    const availability = await availabilityOfTaskTags(settings)
    if (!availability.available) return "Pulada: tags de tarefas indisponíveis"

    const closed = await concludedColumnKeys()
    const filter: Record<string, unknown> = { archived: { $ne: true } }
    if (closed.length) filter.columnId = { $nin: closed }
    const pending = await findTasksForTags(filter, true)
    if (pending.length === 0) return "Nenhuma tag pendente"
    return tagTasks(pending)
}

/**
 * Rotina "Tags de tarefas concluídas (IA)": gera as tags das tarefas nas colunas de conclusão.
 * Escopo `pending` (padrão) só marca as que faltam/estão desatualizadas; `all` regenera todas. Roda
 * desligada por padrão — use "Executar agora" nas Crons ou ligue-a para rodar de hora em hora.
 */
export async function runTaskTagsConcludedBackfill(scope: CronJobScope = "pending"): Promise<string> {
    const { settings } = await loadTaskTagsSettings()
    const availability = await availabilityOfTaskTags(settings)
    if (!availability.available) return "Pulada: tags de tarefas indisponíveis"

    const closed = await concludedColumnKeys()
    if (closed.length === 0) return "Nenhuma coluna de conclusão configurada"
    const tasks = await findTasksForTags({ archived: { $ne: true }, columnId: { $in: closed } }, scope === "pending")
    if (tasks.length === 0) return scope === "pending" ? "Nenhuma tag pendente nas tarefas concluídas" : "Nenhuma tarefa concluída"
    return tagTasks(tasks)
}
