import { FORK_INTEGRATION_TARGET_LABELS, type ForkIntegrationTarget } from "@/features/agentic/constants"
import { buildTranscript, hasConversation, ownerMessages, type TranscriptInput, type TranscriptResult, type TranscriptReview } from "../../mentor/transcript"

/**
 * Leitura da transcrição de uma mesa concluída (OPE-165): os eventos de `agentic_events` da conversa
 * principal e dos forks INTEGRADOS (em ordem de `seq`), mais os dados estruturados da mesa (plano, PR,
 * conclusão manual e as revisões do Agente Adversário). Os modelos entram sob demanda.
 */

export interface LoadedTranscript extends TranscriptResult {
    forkCount: number
    /** Há mensagem do dono ou texto do agente. */
    hasConversation: boolean
    /** Mensagens do dono (o sanitizador recusa cópia literal delas). */
    ownerMessages: string[]
}

export interface TranscriptTask {
    workbenchId: string
    taskCode: string
    taskTitle: string
    projectName: string | null
    completedAt: Date
}

const integrationLabel = (target: string | undefined) => (target && target in FORK_INTEGRATION_TARGET_LABELS ? FORK_INTEGRATION_TARGET_LABELS[target as ForkIntegrationTarget].label : "outra conversa")

const iso = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString() : null)

/** Eventos gravados de uma conversa (mesa ou fork), em ordem. */
async function eventsOf(conversationId: string): Promise<Record<string, unknown>[]> {
    const { AgenticEvent } = await import("@/lib/db/models/Agentic")
    const rows = await AgenticEvent.find({ workbenchId: conversationId }).sort({ seq: 1 }).select({ payload: 1 }).lean()
    return rows.map((row) => (row.payload ?? {}) as Record<string, unknown>)
}

async function reviewsOf(workbenchId: string): Promise<TranscriptReview[]> {
    const { AdversarialReview } = await import("../models")
    const rows = await AdversarialReview.find({ workbenchId }).sort({ startedAt: 1 }).lean()
    return rows.map((row, index) => {
        // A situação de cada achado vem da rodada seguinte (resolvido, sem solução, contestação aceita).
        const next = rows[index + 1]
        const status = new Map((next?.previous ?? []).map((item) => [item.id, item.status]))
        return {
            round: row.round,
            decision: row.decision ?? row.state ?? null,
            summary: row.summary ?? null,
            findings: (row.findings ?? []).map((finding) => ({ id: finding.id, severity: finding.severity, title: finding.title, blocking: finding.blocking, status: status.get(finding.id) ?? null })),
            disputes: row.disputes ?? [],
        }
    })
}

/** Monta a entrada da transcrição (puro daqui para frente). Lança se a mesa não existir. */
export async function loadTranscriptInput(task: TranscriptTask): Promise<{ input: TranscriptInput; forkCount: number }> {
    const { flushWorkbenchEvents } = await import("@/features/agentic/server/hub")
    // O aviso "Mesa concluída" pode ainda estar no buffer do hub.
    await flushWorkbenchEvents(task.workbenchId).catch(() => undefined)
    const { AgenticFork, AgenticWorkbench } = await import("@/lib/db/models/Agentic")
    const doc = await AgenticWorkbench.findById(task.workbenchId).select({ plans: 1, pr: 1, manualCompletion: 1 }).lean()
    if (!doc) throw new Error("A mesa não existe mais")
    const forks = await AgenticFork.find({ workbenchId: task.workbenchId, status: "integrated" }).sort({ number: 1 }).lean()
    const [main, reviews, forkEvents] = await Promise.all([eventsOf(task.workbenchId), reviewsOf(task.workbenchId), Promise.all(forks.map((fork) => eventsOf(String(fork._id))))])
    const input: TranscriptInput = {
        header: {
            task: { code: task.taskCode, title: task.taskTitle },
            project: task.projectName,
            plans: (doc.plans ?? []).map((plan) => ({ version: plan.version, text: plan.text, feedback: plan.feedback ?? null })),
            pr: doc.pr ? { number: doc.pr.number, url: doc.pr.url, state: doc.pr.state, mergedAt: iso(doc.pr.mergedAt) } : null,
            manualCompletion: doc.manualCompletion ? { reason: doc.manualCompletion.reason, fromStage: doc.manualCompletion.fromStage } : null,
            reviews,
            completedAt: task.completedAt.toISOString(),
        },
        conversations: [
            { title: "Conversa principal", events: main },
            ...forks.map((fork, index) => ({
                title: `Fork #${fork.number} (integrado: ${integrationLabel(fork.integration?.target)})`,
                note: fork.integration?.summary ?? null,
                events: forkEvents[index] ?? [],
            })),
        ],
    }
    return { input, forkCount: forks.length }
}

export async function loadWorkbenchTranscript(task: TranscriptTask, threshold: number): Promise<LoadedTranscript> {
    const { input, forkCount } = await loadTranscriptInput(task)
    return { ...buildTranscript(input, threshold), forkCount, hasConversation: hasConversation(input), ownerMessages: ownerMessages(input) }
}
