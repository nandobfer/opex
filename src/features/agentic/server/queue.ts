import { isValidObjectId } from "mongoose"
import { dbConnect } from "@/lib/db"
import { AgenticCentral, AgenticWorkbench } from "@/lib/db/models/Agentic"
import { DevTask } from "@/lib/db/models/DevTask"
import { DomainError } from "@/lib/api/route"
import { logger } from "@/lib/logger"
import { parseCentralConfig, resolveCentralColumns } from "../logic"
import type { AgenticColumns, CentralConfig } from "../schemas"
import type { QueueItemDto } from "../types"
import { loadAgenticSettings } from "./settings"
import { occupiedSlots, runInCentral, waitingResumes } from "./slots"
import { startPendingTurn, startWorkbenchInCentral } from "./workflow"

/**
 * Fila da central de desenvolvimento: uma **coluna configurável** da central (`columns.queue`). Ao
 * mover um card para ela, a tarefa do projeto entra na fila; a mesa é aberta na hora quando há vaga
 * e, senão, quando uma mesa conclui (ou é excluída). A ordem é a dos cards no kanban (`order`).
 *
 * A fila é **derivada** (sem coleção própria): tarefas do projeto na coluna, não arquivadas e sem
 * mesa. O motor (`pumpCentralQueue`) é serializado por central para nunca abrir além do limite.
 */

/** Erros que não devem travar a fila (a tarefa não é mais candidata: segue para a próxima). */
const SKIP_CODES = new Set(["WORKBENCH_EXISTS", "TASK_OTHER_PROJECT", "TASK_NOT_FOUND", "CENTRAL_NOT_FOUND"])

interface LoadedCentral {
    projectId: string
    config: CentralConfig
    /** Colunas efetivas da central (o que ela não personaliza vem do padrão global — OPE-79). */
    columns: AgenticColumns
}

async function loadCentral(centralId: string): Promise<LoadedCentral | null> {
    if (!isValidObjectId(centralId)) return null
    await dbConnect()
    const doc = await AgenticCentral.findById(centralId).select({ projectId: 1, config: 1 }).lean().catch(() => null)
    if (!doc) return null
    const config = parseCentralConfig(doc.config)
    const { settings } = await loadAgenticSettings()
    return { projectId: doc.projectId, config, columns: resolveCentralColumns(settings.columns, config.columns) }
}

/** Tarefas aguardando na fila, na ordem dos cards no kanban; a posição é 1-based. */
async function waitingTasks(centralId: string, projectId: string, columnKey: string): Promise<QueueItemDto[]> {
    const [tasks, workbenches] = await Promise.all([
        DevTask.find({ projectId, columnId: columnKey, archived: { $ne: true } }).sort({ order: 1, createdAt: 1 }).lean(),
        AgenticWorkbench.find({ centralId }).select({ taskId: 1 }).lean(),
    ])
    const started = new Set(workbenches.map((item) => item.taskId))
    return tasks
        .filter((task) => !started.has(String(task._id)))
        .map((task, index) => ({ taskId: String(task._id), code: task.code, title: task.title, columnId: task.columnId, position: index + 1 }))
}

/** Fila de uma central (para a tela). Vazia quando não há coluna da fila configurada. */
export async function listCentralQueue(centralId: string): Promise<QueueItemDto[]> {
    const central = await loadCentral(centralId)
    const columnKey = central?.columns.queue
    if (!central || !columnKey || !central.config.enabled) return []
    return waitingTasks(centralId, central.projectId, columnKey)
}

/** Processa a fila de uma central. Serializado por central (`runInCentral`) para respeitar o limite. */
export function pumpCentralQueue(centralId: string): Promise<void> {
    return runInCentral(centralId, () => runPump(centralId)).catch(() => undefined)
}

/**
 * Lança as retomadas aguardando vaga (FIFO) enquanto houver vaga. Devolve as vagas ocupadas ao fim
 * e se ainda sobrou retomada esperando (nesse caso, nenhuma mesa nova deve abrir).
 */
async function pumpResumes(centralId: string, max: number): Promise<{ open: number; blocked: boolean }> {
    let open = await occupiedSlots(centralId)
    const waiting = await waitingResumes(centralId)
    for (const item of waiting) {
        if (open >= max) return { open, blocked: true }
        try {
            if ((await startPendingTurn(String(item._id))) === "started") open++
        } catch (error) {
            // Indisponível agora (OpenCode, central desativada…): a retomada segue esperando na mesma posição.
            logger.warn({ err: error, centralId, workbenchId: String(item._id) }, "[agentic-queue] Retomada aguardando vaga não iniciada")
            return { open, blocked: true }
        }
    }
    return { open, blocked: false }
}

/** Lança as retomadas e depois abre mesas novas enquanto houver vaga, na ordem da fila. Nunca lança. */
async function runPump(centralId: string): Promise<void> {
    try {
        const central = await loadCentral(centralId)
        if (!central) return
        const resumed = await pumpResumes(centralId, central.config.maxConcurrent)
        let open = resumed.open
        const columnKey = central.columns.queue
        if (resumed.blocked || !columnKey || !central.config.enabled) return
        if (open >= central.config.maxConcurrent) return
        for (const item of await waitingTasks(centralId, central.projectId, columnKey)) {
            if (open >= central.config.maxConcurrent) break
            try {
                await startWorkbenchInCentral(centralId, item.taskId)
                open++
            } catch (error) {
                const code = error instanceof DomainError ? error.code : undefined
                if (code && !SKIP_CODES.has(code)) break
                logger.warn({ err: error, centralId, taskId: item.taskId }, "[agentic-queue] Mesa não aberta para a tarefa da fila")
            }
        }
    } catch (error) {
        logger.error({ err: error, centralId }, "[agentic-queue] Falha ao processar a fila da central")
    }
}

/** Processa a fila de todas as centrais (rotina de segurança: reinício, vaga liberada offline, etc.). */
export async function pumpAllCentralQueues(): Promise<string> {
    await dbConnect()
    const docs = await AgenticCentral.find().select({ _id: 1, config: 1 }).lean()
    const { settings } = await loadAgenticSettings()
    let processed = 0
    for (const doc of docs) {
        // Sem coluna da fila, a central ainda pode ter retomadas aguardando vaga.
        const hasQueue = Boolean(resolveCentralColumns(settings.columns, parseCentralConfig(doc.config).columns).queue)
        if (!hasQueue && !(await AgenticWorkbench.exists({ centralId: String(doc._id), pendingTurn: { $ne: null } }))) continue
        await pumpCentralQueue(String(doc._id))
        processed++
    }
    return processed ? `${processed} central(is) com fila processada(s)` : "Nenhuma fila configurada"
}

/** Chamado quando tarefas mudam de coluna: processa a(s) fila(s) das centrais dos projetos afetados. */
export async function notifyTasksColumnChanged(taskIds: string[]): Promise<void> {
    if (!taskIds.length) return
    await dbConnect()
    const tasks = await DevTask.find({ _id: { $in: taskIds } }).select({ projectId: 1 }).lean()
    const projectIds = [...new Set(tasks.map((task) => task.projectId))]
    if (!projectIds.length) return
    const centrals = await AgenticCentral.find({ projectId: { $in: projectIds } }).select({ _id: 1 }).lean()
    await Promise.all(centrals.map((central) => pumpCentralQueue(String(central._id))))
}
