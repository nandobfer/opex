import { AgenticCentral, AgenticWorkbench } from "@/lib/db/models/Agentic"
import { DevTask } from "@/lib/db/models/DevTask"
import { OrcamentoDraft } from "@/lib/db/models/Orcamento"

/** Vínculos de uma execução para os filtros (cliente e repositório) e o histórico (tarefa). */
export interface RunLinks {
    taskId: string | null
    taskCode: string | null
    taskTitle: string | null
    clientId: string | null
    projectId: string | null
}

const EMPTY: RunLinks = { taskId: null, taskCode: null, taskTitle: null, clientId: null, projectId: null }

/**
 * Resolve cliente e repositório por tarefa, mesa, central ou rascunho de orçamento, com cache por
 * chamada (uma sincronização resolve a mesma tarefa uma vez só).
 */
export function createLinkResolver() {
    const tasks = new Map<string, Promise<RunLinks>>()
    const centrals = new Map<string, Promise<string | null>>()
    const workbenches = new Map<string, Promise<string | null>>()

    const task = (taskId: string | null | undefined): Promise<RunLinks> => {
        if (!taskId) return Promise.resolve(EMPTY)
        let hit = tasks.get(taskId)
        if (!hit) {
            hit = (async () => {
                const doc = /^[a-f0-9]{24}$/i.test(taskId) ? await DevTask.findById(taskId).select({ code: 1, title: 1, clientId: 1, projectId: 1 }).lean() : null
                if (doc) return { taskId, taskCode: doc.code, taskTitle: doc.title, clientId: doc.clientId ?? null, projectId: doc.projectId ? String(doc.projectId) : null }
                const draft = /^[a-f0-9]{24}$/i.test(taskId) ? await OrcamentoDraft.findById(taskId).select({ clientId: 1, projectId: 1, taskId: 1, preview: 1 }).lean() : null
                if (draft) return { taskId: draft.taskId ?? null, taskCode: null, taskTitle: draft.preview?.title ?? null, clientId: draft.clientId ?? null, projectId: draft.projectId ?? null }
                return { ...EMPTY, taskId: null }
            })()
            tasks.set(taskId, hit)
        }
        return hit
    }

    const centralProject = (centralId: string | null | undefined): Promise<string | null> => {
        if (!centralId) return Promise.resolve(null)
        let hit = centrals.get(centralId)
        if (!hit) {
            hit = AgenticCentral.findById(centralId)
                .select({ projectId: 1 })
                .lean()
                .then((doc) => (doc?.projectId ? String(doc.projectId) : null))
            centrals.set(centralId, hit)
        }
        return hit
    }

    const workbenchTask = (workbenchId: string | null | undefined): Promise<string | null> => {
        if (!workbenchId) return Promise.resolve(null)
        let hit = workbenches.get(workbenchId)
        if (!hit) {
            hit = AgenticWorkbench.findById(workbenchId)
                .select({ taskId: 1 })
                .lean()
                .then((doc) => doc?.taskId ?? null)
            workbenches.set(workbenchId, hit)
        }
        return hit
    }

    /** Tarefa (direta ou pela mesa) e, sem tarefa, o repositório da central. */
    return async function resolve(ref: { taskId?: string | null; workbenchId?: string | null; centralId?: string | null }): Promise<RunLinks> {
        const taskId = ref.taskId ?? (await workbenchTask(ref.workbenchId))
        const links = await task(taskId)
        if (links.projectId) return links
        return { ...links, projectId: await centralProject(ref.centralId) }
    }
}
