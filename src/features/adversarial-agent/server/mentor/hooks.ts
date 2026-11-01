import { loggerFor } from "@/lib/logger"
import { MENTOR_AI_STAGES, type MentorAiStage, type MentorSource, type MentorUserTrigger } from "../../mentor/constants"
import type { MentorSettings } from "../../mentor/schemas"
import { enqueueMentorRun } from "./queue"
import { mentorSettingsFor } from "./settings"

/**
 * Pontos em que o fluxo da mesa chama o Agente Mentor (via `server/workflow-hook.ts`). Nenhum lança:
 * qualquer falha do Mentor é logada e a mesa segue como sem ele.
 */

const log = loggerFor({ module: "adversarial-agent", feature: "mentor" })

const isAiStage = (stage: string): stage is MentorAiStage => (MENTOR_AI_STAGES as readonly string[]).includes(stage)

/** Mensagens do chat ao vivo por mesa, consumidas ao fim da cadeia de turnos em andamento. */
const globalForMentor = globalThis as typeof globalThis & { __opexMentorLive?: Map<string, string[]> }
const liveMessages = (globalForMentor.__opexMentorLive ??= new Map())

/**
 * Rodada do Agente Adversário que acabou de terminar, como turno da cadeia para o Mentor ("Revisões do
 * adversário"): o relatório (ou o resumo) da revisão mais recente da mesa. Nunca lança.
 */
export async function mentorAdversarialTurn(workbenchId: string): Promise<MentorTurnRecord | null> {
    try {
        const { AdversarialReview } = await import("../models")
        const review = await AdversarialReview.findOne({ workbenchId, finishedAt: { $ne: null } })
            .sort({ startedAt: -1 })
            .select({ report: 1, summary: 1 })
            .lean()
        const text = review?.report ?? review?.summary ?? null
        return text ? { stage: "adversarial_review", text } : null
    } catch (error) {
        log.warn({ err: error, workbenchId }, "[adversarial-agent] Agente Mentor: rodada do adversário não lida")
        return null
    }
}

/** Chat ao vivo: guarda a mensagem para a avaliação do fim do turno em andamento. */
export function mentorRecordLiveMessage(workbenchId: string, text: string): void {
    const trimmed = text.trim()
    if (!trimmed) return
    liveMessages.set(workbenchId, [...(liveMessages.get(workbenchId) ?? []), trimmed])
}

/**
 * Cadeia que não vai ao Mentor (reconexão ou limpeza): descarta as mensagens ao vivo guardadas, para
 * que não sejam avaliadas junto de outra cadeia da mesa.
 */
export function mentorDiscardLiveMessages(workbenchId: string): void {
    liveMessages.delete(workbenchId)
}

/** Ação da mesa (que originou a cadeia de turnos) → tipo de mensagem do usuário e o texto dela. */
export function mentorTriggerOf(origin: { action: string | null; userText: string | null; feedback: string | null }): { trigger: MentorUserTrigger; text: string } | null {
    const afterTitle = origin.userText?.includes("\n\n") ? origin.userText.slice(origin.userText.indexOf("\n\n") + 2).trim() : ""
    const feedback = origin.feedback?.trim() ?? ""
    const pick = (trigger: MentorUserTrigger, text: string) => (text ? { trigger, text } : null)
    switch (origin.action) {
        case "revise-plan":
            return pick("plan_revision", feedback)
        case "implement":
            return pick("implement_info", afterTitle)
        case "request-correction":
            return pick("preview_correction", feedback)
        case "submit-pr-feedback":
        case "pr-feedback":
            return pick("pr_feedback", feedback)
        case "reopen":
            return pick("reopen", feedback)
        case "adversarial-fix":
            return pick("adversarial_guidance", afterTitle)
        default:
            return null
    }
}

export interface MentorTurnRecord {
    stage: string
    text: string
}

export interface MentorAfterTurnsInput {
    workbenchId: string
    centralId: string
    taskId: string
    taskCode: string
    taskTitle: string
    projectName: string | null
    repo: string | null
    approvedPlan: string | null
    origin: { action: string | null; userText: string | null; feedback: string | null }
    turns: MentorTurnRecord[]
    /** Início da cadeia (as memórias que o próprio agente gravou desde então vão ao Mentor). */
    since?: Date | null
}

/** Atores do aprendizado autônomo nas mesas (o próprio Mentor, `agente:mentor`, fica de fora). */
const SELF_LEARNING_ACTORS = ["agente:desenvolvedor", "agente:adversario"]

/**
 * Memórias que o agente desenvolvedor ou o Adversário gravaram sozinhos nesta mesa desde o início da
 * cadeia (auditoria `MemoriaAgente` com `ator` agente:desenvolvedor/adversario): o Mentor não repete o que já foi aprendido.
 */
async function selfLearnedMemories(workbenchId: string, since: Date | null): Promise<string[]> {
    if (!since) return []
    try {
        const { AuditLog } = await import("@/lib/db/models/AuditLog")
        const rows = await AuditLog.find({ entidade: "MemoriaAgente", "dadosNovos.mesa": workbenchId, "dadosNovos.ator": { $in: SELF_LEARNING_ACTORS }, timestamp: { $gte: since } })
            .sort({ timestamp: 1 })
            .limit(20)
            .select({ dadosNovos: 1 })
            .lean<{ dadosNovos?: { texto?: string } }[]>()
        return rows.map((row) => row.dadosNovos?.texto).filter((text): text is string => Boolean(text))
    } catch (error) {
        log.warn({ err: error, workbenchId }, "[adversarial-agent] Agente Mentor: memórias gravadas pelo agente não lidas")
        return []
    }
}

/** O que dispara o Mentor neste fim de cadeia, conforme a configuração. */
export function mentorSourcesFor(settings: MentorSettings, input: Pick<MentorAfterTurnsInput, "origin" | "turns">, live: readonly string[]) {
    const sources = new Set<MentorSource>()
    const userParts: string[] = []
    const fromAction = mentorTriggerOf(input.origin)
    let trigger: MentorUserTrigger | null = null
    if (fromAction && settings.triggers.user[fromAction.trigger]) {
        trigger = fromAction.trigger
        userParts.push(fromAction.text)
    }
    if (live.length && settings.triggers.user.live_chat) {
        trigger ??= "live_chat"
        userParts.push(...live)
    }
    if (userParts.length) sources.add("user")
    if (input.turns.some((turn) => isAiStage(turn.stage) && settings.triggers.ai[turn.stage])) sources.add("ai")
    return { sources: [...sources], trigger, userMessage: userParts.length ? userParts.join("\n\n") : null }
}

/** Fim da cadeia de turnos da mesa: enfileira uma execução do Mentor quando algum gatilho ligado bateu. */
export async function mentorAfterTurns(input: MentorAfterTurnsInput): Promise<string | null> {
    const live = liveMessages.get(input.workbenchId) ?? []
    liveMessages.delete(input.workbenchId)
    try {
        const settings = await mentorSettingsFor(input.centralId)
        if (!settings) return null
        const found = mentorSourcesFor(settings, input, live)
        const runInput = {
            workbenchId: input.workbenchId,
            centralId: input.centralId,
            taskId: input.taskId,
            taskCode: input.taskCode,
            taskTitle: input.taskTitle,
            projectName: input.projectName,
            repo: input.repo,
            approvedPlan: settings.context.approvedPlan ? input.approvedPlan : null,
            case: {
                sources: found.sources,
                trigger: found.trigger,
                userMessage: found.userMessage,
                responses: input.turns.map((turn) => ({ stage: turn.stage, text: turn.text })),
                selfLearned: await selfLearnedMemories(input.workbenchId, input.since ?? null),
            },
        }
        if (!found.sources.length) return null
        return await enqueueMentorRun(runInput, settings)
    } catch (error) {
        log.warn({ err: error, workbenchId: input.workbenchId }, "[adversarial-agent] Agente Mentor: não foi possível enfileirar a avaliação")
        return null
    }
}
