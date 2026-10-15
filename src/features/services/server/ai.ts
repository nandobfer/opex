import { dbConnect } from "@/lib/db"
import { AiUsageLog } from "@/lib/db/models/Ai"
import { FinanceService } from "@/lib/db/models/FinanceService"
import { Project } from "@/lib/db/models/Project"
import { integrationDebug } from "@/lib/integrations/debug"
import { loggerFor } from "@/lib/logger"
import { streamAi, type AiStreamEvent } from "@/lib/ai/stream"
import { availabilityOfBudgetPreview, loadBudgetPreviewSettings } from "@/features/ai/server/settings"
import { generateTagsForInput } from "@/features/ai/server/task-tags"
import { taskSummarySourceHash, toSummaryLine } from "@/features/ai/task-summary"
import { taskTagsSourceHash } from "@/features/ai/task-tags"
import { buildServiceAiInstructions, buildServiceAiPrompt, parseServiceAi } from "../ai-prompt"
import { SERVICE_AI_ORIGIN, SERVICE_SUMMARY_MAX, SERVICE_TITLE_MAX } from "../constants"
import { publishServicesUpdated } from "./service"
import type { ServiceRow } from "./service"

/**
 * Geração por IA de um serviço (SOMENTE servidor), em **segundo plano**: usa as configurações já
 * existentes — "Orçamentos" para o título/resumo (provedores de texto) e "Tags de tarefas" para as
 * tags (texto ou JEV). Nunca bloqueia o formulário; falhas viram `aiStatus: "error"` com
 * "Gerar novamente". O serviço entra nas somas independentemente da IA.
 */

const log = loggerFor({ module: "services", feature: "ai" })

async function markError(id: string, message: string): Promise<void> {
    await dbConnect()
    await FinanceService.updateOne({ _id: id }, { $set: { aiStatus: "error", aiError: message } }, { timestamps: false })
    await publishServicesUpdated([id])
}

/** Gera título, resumo e tags do serviço; no-op silencioso quando o serviço não existe mais. */
export async function generateServiceAi(id: string): Promise<void> {
    try {
        await dbConnect()
        const service = (await FinanceService.findById(id)
            .select({ code: 1, description: 1, projectId: 1, serviceDate: 1 })
            .lean()) as unknown as Pick<ServiceRow, "code" | "description" | "projectId" | "serviceDate"> | null
        if (!service) return

        const { settings } = await loadBudgetPreviewSettings()
        const availability = await availabilityOfBudgetPreview(settings)
        if (!availability.available || !settings.provider || !settings.model) {
            await markError(id, availability.reason ?? "Geração por IA indisponível")
            return
        }

        const description = service.description ?? ""
        const project = service.projectId ? await Project.findById(service.projectId).select({ name: 1 }).lean() : null
        const sourceHash = taskSummarySourceHash({ title: service.code, description })

        const dbg = integrationDebug("ai")
        dbg.step(`[servicos] ${service.code} com ${settings.provider}/${settings.model}`, { agent: settings.agent, variant: settings.variant })

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
            instructions: buildServiceAiInstructions(settings.instructions),
            prompt: buildServiceAiPrompt({ code: service.code, projectName: project?.name ?? null, serviceDate: new Date(service.serviceDate).toISOString().slice(0, 10), description }),
            title: `Serviço ${service.code}`,
            consumption: { origin: SERVICE_AI_ORIGIN, subject: id },
        })) {
            if (event.type === "delta") text += event.text
            if (event.type === "done" || event.type === "error") last = event
        }

        if (last?.type === "error") {
            await markError(id, last.message)
            dbg.error(`[servicos] ${last.message}`)
            return
        }

        const parsed = parseServiceAi(text)
        if (!parsed) {
            await markError(id, "A IA não devolveu um título/resumo válido")
            return
        }

        const title = parsed.title ? parsed.title.slice(0, SERVICE_TITLE_MAX) : null
        const summary = parsed.summary ? toSummaryLine(parsed.summary, SERVICE_SUMMARY_MAX) : null

        // Tags: melhor esforço (se a feature estiver indisponível, mantém as tags atuais).
        const tags = await generateTagsForInput({ title: title ?? service.code, description, taskType: null, projectName: project?.name ?? null, summary }, id)

        // Nunca sobrescreve uma descrição mais recente do que a que gerou esta saída.
        const still = (await FinanceService.findById(id).select({ description: 1 }).lean()) as unknown as { description: string | null } | null
        if (!still || taskSummarySourceHash({ title: service.code, description: still.description ?? "" }) !== sourceHash) return

        await FinanceService.updateOne(
            { _id: id },
            {
                $set: {
                    title,
                    summary,
                    summarySourceHash: sourceHash,
                    summaryUpdatedAt: new Date(),
                    ...(tags ? { tags, tagsSourceHash: taskTagsSourceHash({ title: title ?? service.code, description }), tagsUpdatedAt: new Date() } : {}),
                    aiStatus: "done",
                    aiError: null,
                },
            },
            { timestamps: false },
        )

        try {
            await AiUsageLog.create({
                feature: SERVICE_AI_ORIGIN,
                provider: settings.provider,
                model: settings.model,
                subject: id,
                ok: true,
                error: null,
                inputTokens: last?.type === "done" ? last.usage.inputTokens : null,
                outputTokens: last?.type === "done" ? last.usage.outputTokens : null,
                totalTokens: last?.type === "done" ? last.usage.totalTokens : null,
                costUsd: last?.type === "done" ? last.usage.costUsd : null,
                durationMs: Date.now() - startedAt,
            })
        } catch (error) {
            log.warn({ err: error instanceof Error ? error.message : error }, "[servicos] falha ao registrar uso de IA")
        }

        await publishServicesUpdated([id])
        dbg.success(`[servicos] ${service.code} concluído em ${Date.now() - startedAt} ms`)
    } catch (error) {
        const message = error instanceof Error ? error.message : "Falha ao gerar o serviço por IA"
        log.warn({ err: message, serviceId: id }, "[servicos] falha na geração por IA")
        await markError(id, message).catch(() => undefined)
    }
}
