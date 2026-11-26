import { OpexWatch, OpexWatchFact, type IOpexWatchFact } from "@/lib/db/models/Opex"
import { loggerFor } from "@/lib/logger"
import type { OpexWatchEvent, OpexWatchTargetKind } from "../watches"

/**
 * Fontes de evento da observação (OPE-194): tarefas, mesas, execuções de rotineiro, jobs e deploys de
 * ambiente chamam estas funções DEPOIS da mutação gravada e auditada, e esperam só a gravação do fato
 * (um `exists` indexado e, com observação no alvo, um insert em `opex_watch_facts`). O disparo roda em
 * seguida, em segundo plano; se o processo cair antes, o tick reprocessa o fato pendente. Nada aqui lança.
 */

const log = loggerFor({ module: "opex-agent", feature: "watches" })

/** Dados brutos da transição, por tipo (os nomes de coluna e rótulos saem no processamento). */
export type WatchFactSource =
    | { type: "task_moved"; code: string; projectId: string; from: string; to: string }
    | { type: "task_archived"; code: string }
    | { type: "deleted"; label: string }
    | { type: "workbench_changed"; stage: string | null; previousStage: string | null; runState: string | null; error: string | null }
    | { type: "routine_run_settled"; agentName: string; status: string; error: string | null }
    | { type: "job_settled"; title: string; status: string; error: string | null }
    | { type: "deploy_finished"; status: "success" | "failed"; error: string | null }

/**
 * Grava o fato (só quando o alvo tem observação ativa) e dispara o processamento em segundo plano. A
 * fonte espera esta função: o fato fica durável antes de a fonte responder.
 */
export async function recordWatchFact(kind: OpexWatchTargetKind, id: string, source: WatchFactSource, at: Date = new Date()): Promise<void> {
    try {
        if (!(await OpexWatch.exists({ status: "watching", "target.kind": kind, "target.id": id }))) return
        const fact = await OpexWatchFact.create({ kind, targetId: id, source, at, status: "pending" })
        const factId = String(fact._id)
        void import("./watches")
            .then(({ processWatchFact }) => processWatchFact(factId))
            .catch((error: unknown) => log.warn({ err: error instanceof Error ? error.message : error, factId }, "[opex] fato da observação fica para o tick"))
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : error, kind, id }, "[opex] falha ao gravar o fato da observação")
    }
}

/** Monta o fato com os nomes (colunas, conclusão do projeto, rótulos) a partir dos dados brutos. */
export async function buildFactEvent(fact: Pick<IOpexWatchFact, "kind" | "targetId" | "source" | "at">): Promise<OpexWatchEvent | null> {
    const source = fact.source as WatchFactSource
    const id = fact.targetId
    const at = new Date(fact.at)
    switch (source.type) {
        case "task_moved": {
            const { getBoard } = await import("@/features/tasks/server/columns")
            const { Project } = await import("@/lib/db/models/Project")
            const names = new Map((await getBoard()).columns.map((column) => [column.key, column.name]))
            const project = await Project.findById(source.projectId).select({ closedColumnKey: 1 }).lean<{ closedColumnKey: string | null }>()
            return {
                kind: "task",
                id,
                label: source.code,
                from: { key: source.from, name: names.get(source.from) ?? source.from },
                to: { key: source.to, name: names.get(source.to) ?? source.to },
                done: Boolean(project?.closedColumnKey && project.closedColumnKey === source.to),
                at,
            }
        }
        case "task_archived":
            return { kind: "task", id, label: source.code, archived: true, at }
        case "deleted":
            return { kind: fact.kind, id, label: source.label, deleted: true, at }
        case "workbench_changed": {
            const { AgenticWorkbench } = await import("@/lib/db/models/Agentic")
            const doc = await AgenticWorkbench.findById(id).select({ taskCode: 1 }).lean<{ taskCode: string }>()
            return { kind: "workbench", id, label: doc?.taskCode ?? id, stage: source.stage, previousStage: source.previousStage, runState: source.runState, error: source.error, at }
        }
        case "routine_run_settled":
            return { kind: "routine_run", id, label: source.agentName, status: source.status, error: source.error, at }
        case "job_settled":
            return { kind: "job", id, label: source.title, status: source.status, error: source.error, at }
        case "deploy_finished": {
            const { Environment } = await import("@/features/environments/server/models")
            const env = await Environment.findById(id).select({ name: 1, slug: 1 }).lean<{ name: string; slug: string }>()
            return { kind: "environment", id, label: env?.name || env?.slug || id, status: source.status, error: source.error, at }
        }
        default:
            return null
    }
}

/** Tarefa mudou de coluna (`moveTask` e a edição com troca de coluna em `updateTask`). */
export function watchTaskMoved(task: { id: string; code: string; projectId: string }, fromKey: string, toKey: string, at?: Date): Promise<void> {
    return recordWatchFact("task", task.id, { type: "task_moved", code: task.code, projectId: task.projectId, from: fromKey, to: toKey }, at)
}

/** Tarefa arquivada (`setTaskArchived`). */
export function watchTaskArchived(task: { id: string; code: string }, at?: Date): Promise<void> {
    return recordWatchFact("task", task.id, { type: "task_archived", code: task.code }, at)
}

/** Alvo excluído (tarefa, mesa): as observações acordam o agente com o desfecho `target_deleted`. */
export function watchTargetDeleted(kind: OpexWatchTargetKind, id: string, label: string, at?: Date): Promise<void> {
    return recordWatchFact(kind, id, { type: "deleted", label }, at)
}

/** Mesa mudou de etapa ou de estado de execução (`update()` do workflow). */
export function watchWorkbenchChanged(workbenchId: string, change: { stage?: string | null; previousStage?: string | null; runState?: string | null; error?: string | null }, at?: Date): Promise<void> {
    if (!change.stage && !change.runState) return Promise.resolve()
    return recordWatchFact("workbench", workbenchId, { type: "workbench_changed", stage: change.stage ?? null, previousStage: change.previousStage ?? null, runState: change.runState ?? null, error: change.error ?? null }, at)
}

/** Execução de rotineiro terminou ou parou aguardando confirmação (`afterSettle`). */
export function watchRoutineRunSettled(run: { id: string; agentName: string; status: string; error?: string | null }, at?: Date): Promise<void> {
    return recordWatchFact("routine_run", run.id, { type: "routine_run_settled", agentName: run.agentName, status: run.status, error: run.error ?? null }, at)
}

/** Job do Agente Opex terminou ou foi cancelado (`finishJob` / `cancelOpexJob`). */
export function watchJobSettled(job: { id: string; title: string; status: string; error?: string | null }, at?: Date): Promise<void> {
    return recordWatchFact("job", job.id, { type: "job_settled", title: job.title, status: job.status, error: job.error ?? null }, at)
}

/** Deploy (ou mover) de um ambiente terminou (`finishDeploy`). */
export function watchDeployFinished(environmentId: string, deploy: { status: "success" | "failed"; error: string | null }, at?: Date): Promise<void> {
    return recordWatchFact("environment", environmentId, { type: "deploy_finished", status: deploy.status, error: deploy.error }, at)
}
