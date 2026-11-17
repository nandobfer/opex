import { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { loggerFor } from "@/lib/logger"
import { MENTOR_AUDIT_ENTITY } from "../../mentor/constants"
import { effectiveTargets } from "../../mentor/schemas"
import { loadAdversarialSettings } from "../settings"
import type { MentorLearningInput } from "./learn"
import { MentorRun, mentorDb, type IMentorRun } from "./models"
import { enqueueMentorLearning, recoverOrphanMentorRuns } from "./queue"
import { retryableRunIds } from "./run"
import { mentorSettingsFor } from "./settings"

/**
 * Ponto em que o fluxo da mesa chama o Agente Mentor (via `server/workflow-hook.ts`): a conclusão
 * (`completeWorkbench`, OPE-165). Nada mais encerra cadeia para o Mentor — mensagens, turnos, chat ao vivo
 * e feedback de PR já estão na transcrição. Nunca lança: qualquer falha é logada e a mesa segue.
 */

const log = loggerFor({ module: "adversarial-agent", feature: "mentor" })

export type MentorOnDoneInput = MentorLearningInput

/** Destinos que valem agora (o Adversário só com ele ativo). */
async function targetsFor(settings: NonNullable<Awaited<ReturnType<typeof mentorSettingsFor>>>) {
    const adversary = await loadAdversarialSettings().catch(() => null)
    return effectiveTargets(settings.targets, adversary?.settings.enabled ?? false)
}

/** A mesa concluiu: enfileira UMA execução de aprendizado para esta conclusão (idempotente por `completedAt`). */
export async function mentorOnDone(input: MentorOnDoneInput): Promise<string | null> {
    try {
        const settings = await mentorSettingsFor(input.centralId)
        if (!settings) return null
        const targets = await targetsFor(settings)
        if (!targets.length) {
            log.info({ workbenchId: input.workbenchId }, "[adversarial-agent] Agente Mentor: nenhum destino vale (o único ligado é o Adversário, desativado)")
            return null
        }
        return await enqueueMentorLearning(input, settings, targets)
    } catch (error) {
        log.warn({ err: error, workbenchId: input.workbenchId }, "[adversarial-agent] Agente Mentor: não foi possível enfileirar o aprendizado")
        return null
    }
}

/**
 * O Mentor aprende nesta central (ativo, aprendizado na conclusão ligado, central no escopo e ao menos um
 * destino que vale)? Aí o agente
 * desenvolvedor fica somente leitura. Na dúvida (banco fora), `false`: vale a chave de aprendizado autônomo.
 */
export async function mentorLearnsOnDone(centralId: string): Promise<boolean> {
    const settings = await mentorSettingsFor(centralId)
    if (!settings) return false
    // Sem nenhum destino que valha (só o Adversário ligado e ele desativado), o Mentor não roda: o desenvolvedor segue gravando.
    return (await targetsFor(settings)).length > 0
}

/**
 * Tentar novamente: repete a execução de aprendizado que falhou (a mais recente da conclusão, sem outra
 * em andamento) como uma nova tentativa da mesma conclusão. Lê a configuração atual.
 */
export async function retryMentorLearning(runId: string, actorId: string): Promise<string> {
    if (!Types.ObjectId.isValid(runId)) throw new DomainError(404, "Execução não encontrada", "MENTOR_RUN_NOT_FOUND")
    await recoverOrphanMentorRuns()
    await mentorDb()
    const run = (await MentorRun.findById(runId).lean()) as IMentorRun | null
    if (!run) throw new DomainError(404, "Execução não encontrada", "MENTOR_RUN_NOT_FOUND")
    if (run.kind !== "learning" || !run.completedAt) throw new DomainError(409, "Só o aprendizado na conclusão da mesa pode ser repetido", "MENTOR_RUN_NOT_RETRYABLE")
    const siblings = (await MentorRun.find({ workbenchId: run.workbenchId, kind: "learning", completedAt: run.completedAt }).select({ kind: 1, completedAt: 1, attempt: 1, status: 1 }).lean()) as unknown as IMentorRun[]
    if (!retryableRunIds(siblings).has(runId)) throw new DomainError(409, "Só a tentativa mais recente que falhou, sem outra em andamento, pode ser repetida", "MENTOR_RUN_NOT_RETRYABLE")
    const settings = await mentorSettingsFor(run.centralId)
    if (!settings) throw new DomainError(409, "O Agente Mentor não aprende nesta central: ative-o (com Aprender ao concluir) em Integrações › Inteligência Artificial › Agente Mentor", "MENTOR_DISABLED")
    const targets = await targetsFor(settings)
    if (!targets.length) throw new DomainError(409, "Nenhum destino do Mentor vale agora: ligue uma lista do desenvolvedor ou ative o Agente Adversário", "MENTOR_NO_TARGETS")
    const { loadCentral, repoForProject } = await import("@/features/agentic/server/centrals")
    const central = await loadCentral(run.centralId).then((loaded) => loaded.doc).catch(() => null)
    const repo = central ? await repoForProject(central.projectId).catch(() => null) : null
    const attempt = Math.max(...siblings.map((item) => item.attempt ?? 1)) + 1
    const id = await enqueueMentorLearning(
        {
            workbenchId: run.workbenchId,
            centralId: run.centralId,
            taskId: run.taskId,
            taskCode: run.taskCode,
            taskTitle: run.taskTitle,
            projectName: central?.projectName ?? null,
            repo: repo?.repo ?? null,
            completedAt: new Date(run.completedAt),
            completionKind: run.completionKind ?? "merge",
        },
        settings,
        targets,
        { attempt, retryOf: runId },
    )
    if (!id) throw new DomainError(409, "Esta tentativa já foi registrada", "MENTOR_RUN_NOT_RETRYABLE")
    await recordAudit({ userId: actorId, entidade: MENTOR_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.EXECUTAR, depois: { tarefa: run.taskCode, mesa: run.workbenchId, tentativa: attempt, repeteDe: runId } })
    return id
}
