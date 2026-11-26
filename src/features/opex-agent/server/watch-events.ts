import type { OpexWatchEvent, OpexWatchTargetKind } from "../watches"

/**
 * Adaptadores leves das fontes de evento da observação (OPE-194): tarefas, mesas, execuções de
 * rotineiro, jobs e deploys de ambiente chamam estas funções DEPOIS da mutação gravada e auditada.
 * O serviço entra sob demanda e só monta o fato quando há observação no alvo; nada aqui lança.
 */

async function notify(kind: OpexWatchTargetKind, id: string, build: () => Promise<OpexWatchEvent | null> | OpexWatchEvent | null): Promise<void> {
    try {
        const { notifyWatchTarget } = await import("./watches")
        await notifyWatchTarget(kind, id, build)
    } catch {
        // a fonte nunca cai por causa da observação (o serviço já registra a falha)
    }
}

/** Tarefa mudou de coluna (`moveTask`). */
export function watchTaskMoved(task: { id: string; code: string; projectId: string }, fromKey: string, toKey: string): Promise<void> {
    return notify("task", task.id, async () => {
        const [{ getBoard }, { Project }] = await Promise.all([import("@/features/tasks/server/columns"), import("@/lib/db/models/Project")])
        const names = new Map((await getBoard()).columns.map((column) => [column.key, column.name]))
        const project = await Project.findById(task.projectId).select({ closedColumnKey: 1 }).lean<{ closedColumnKey: string | null }>()
        return {
            kind: "task",
            id: task.id,
            label: task.code,
            from: { key: fromKey, name: names.get(fromKey) ?? fromKey },
            to: { key: toKey, name: names.get(toKey) ?? toKey },
            done: Boolean(project?.closedColumnKey && project.closedColumnKey === toKey),
        }
    })
}

/** Tarefa arquivada (`setTaskArchived`). */
export function watchTaskArchived(task: { id: string; code: string }): Promise<void> {
    return notify("task", task.id, () => ({ kind: "task", id: task.id, label: task.code, archived: true }))
}

/** Alvo excluído (tarefa, mesa): as observações acordam o agente com o desfecho `target_deleted`. */
export function watchTargetDeleted(kind: OpexWatchTargetKind, id: string, label: string): Promise<void> {
    return notify(kind, id, () => ({ kind, id, label, deleted: true }))
}

/** Mesa mudou de etapa ou de estado de execução (`update()` do workflow). */
export function watchWorkbenchChanged(workbenchId: string, change: { stage?: string | null; previousStage?: string | null; runState?: string | null; error?: string | null }): Promise<void> {
    if (!change.stage && !change.runState) return Promise.resolve()
    return notify("workbench", workbenchId, async () => {
        const { AgenticWorkbench } = await import("@/lib/db/models/Agentic")
        const doc = await AgenticWorkbench.findById(workbenchId).select({ taskCode: 1 }).lean<{ taskCode: string }>()
        return { kind: "workbench", id: workbenchId, label: doc?.taskCode ?? workbenchId, stage: change.stage ?? null, previousStage: change.previousStage ?? null, runState: change.runState ?? null, error: change.error ?? null }
    })
}

/** Execução de rotineiro terminou ou parou aguardando confirmação (`afterSettle`). */
export function watchRoutineRunSettled(run: { id: string; agentName: string; status: string; error?: string | null }): Promise<void> {
    return notify("routine_run", run.id, () => ({ kind: "routine_run", id: run.id, label: run.agentName, status: run.status, error: run.error ?? null }))
}

/** Job do Agente Opex terminou ou foi cancelado (`finishJob` / `cancelOpexJob`). */
export function watchJobSettled(job: { id: string; title: string; status: string; error?: string | null }): Promise<void> {
    return notify("job", job.id, () => ({ kind: "job", id: job.id, label: job.title, status: job.status, error: job.error ?? null }))
}

/** Deploy (ou mover) de um ambiente terminou (`finishDeploy`). */
export function watchDeployFinished(environmentId: string, deploy: { status: "success" | "failed"; error: string | null }): Promise<void> {
    return notify("environment", environmentId, async () => {
        const { Environment } = await import("@/features/environments/server/models")
        const env = await Environment.findById(environmentId).select({ name: 1, slug: 1 }).lean<{ name: string; slug: string }>()
        return { kind: "environment", id: environmentId, label: env?.name || env?.slug || environmentId, status: deploy.status, error: deploy.error }
    })
}
