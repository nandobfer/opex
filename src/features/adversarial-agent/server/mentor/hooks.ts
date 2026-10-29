import { loggerFor } from "@/lib/logger"
import { MENTOR_AI_STAGES, type MentorAiStage, type MentorSource, type MentorUserTrigger } from "../../mentor/constants"
import { takeLessonBlock, withLessonInstruction, type TakenLesson } from "../../mentor/lesson-block"
import type { LessonBlock, MentorSettings } from "../../mentor/schemas"
import { enqueueMentorRun, recordFailedMentorRun } from "./queue"
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

/** Acrescenta ao pedido do turno a instrução do bloco de lição (quando o Mentor aceita pedidos nesta etapa). */
export async function mentorPrepareTurn(input: { centralId: string; stage: string; text: string }): Promise<string> {
    try {
        if (!isAiStage(input.stage)) return input.text
        const settings = await mentorSettingsFor(input.centralId)
        const developer = settings?.triggers.developer
        return developer?.enabled && developer.stages[input.stage] ? withLessonInstruction(input.text) : input.text
    } catch (error) {
        log.warn({ err: error }, "[adversarial-agent] Agente Mentor: instrução do bloco de lição não aplicada")
        return input.text
    }
}

/** Retira da resposta do agente o bloco de lição (a mesa interpreta o turno sem ele). */
export function mentorTakeLesson(text: string): TakenLesson {
    try {
        return takeLessonBlock(text)
    } catch {
        return { text, lesson: null, error: null }
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
    lesson: LessonBlock | null
    lessonError: string | null
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
    const developer = settings.triggers.developer
    const lessons = developer.enabled ? input.turns.filter((turn) => turn.lesson && isAiStage(turn.stage) && developer.stages[turn.stage]).map((turn) => turn.lesson!) : []
    if (lessons.length) sources.add("developer")
    const lessonError = developer.enabled ? (input.turns.find((turn) => turn.lessonError && isAiStage(turn.stage) && developer.stages[turn.stage])?.lessonError ?? null) : null
    return { sources: [...sources], trigger, userMessage: userParts.length ? userParts.join("\n\n") : null, lessons, lessonError }
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
            case: { sources: found.sources, trigger: found.trigger, userMessage: found.userMessage, responses: input.turns.map((turn) => ({ stage: turn.stage, text: turn.text })), lessons: found.lessons },
        }
        if (!found.sources.length) {
            if (found.lessonError) return await recordFailedMentorRun({ ...runInput, case: { ...runInput.case, sources: ["developer"] } }, settings, found.lessonError)
            return null
        }
        return await enqueueMentorRun(runInput, settings)
    } catch (error) {
        log.warn({ err: error, workbenchId: input.workbenchId }, "[adversarial-agent] Agente Mentor: não foi possível enfileirar a avaliação")
        return null
    }
}
