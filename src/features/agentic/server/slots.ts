import { dbConnect } from "@/lib/db"
import { AgenticWorkbench, type IAgenticWorkbench } from "@/lib/db/models/Agentic"
import { SLOT_EXEMPT_STAGES } from "../constants"

/**
 * Vagas do limite de mesas da central (`maxConcurrent`). Ocupam vaga as mesas não concluídas que
 * não estão esperando o usuário/PR (`SLOT_EXEMPT_STAGES`: Plano pronto, Prévia pronta, PR aberto).
 * Uma mesa isenta (ou concluída, ao reabrir) que precisa executar com o limite cheio grava um
 * `pendingTurn` e **aguarda vaga**; o motor da central (`queue.ts`) lança essas retomadas antes de
 * abrir mesas novas da coluna da fila.
 */

const NOT_OCCUPYING: readonly string[] = ["done", ...SLOT_EXEMPT_STAGES]

const chains = new Map<string, Promise<void>>()

/**
 * Executa `fn` em série com as demais decisões de vaga da central (motor da fila e retomadas), para
 * nunca lançar além do limite. Devolve o resultado (ou o erro) de `fn`; a corrente segue mesmo com erro.
 * Nunca chame `runInCentral` de dentro de outro `runInCentral` da mesma central (travaria a corrente).
 */
export function runInCentral<T>(centralId: string, fn: () => Promise<T>): Promise<T> {
    const previous = chains.get(centralId) ?? Promise.resolve()
    const result = previous.then(fn)
    chains.set(
        centralId,
        result.then(
            () => undefined,
            () => undefined,
        ),
    )
    return result
}

/** A etapa não ocupa vaga (isenta ou concluída): sair dela para executar depende de vaga livre. */
export function needsSlotToRun(stage: string): boolean {
    return NOT_OCCUPYING.includes(stage)
}

/** Mesas da central que ocupam vaga (opcionalmente ignorando uma mesa). */
export async function occupiedSlots(centralId: string, excludeId?: string | null): Promise<number> {
    await dbConnect()
    return AgenticWorkbench.countDocuments({ centralId, stage: { $nin: [...NOT_OCCUPYING] }, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })
}

/** Retomadas aguardando vaga na central, na ordem de chegada (FIFO). */
export async function waitingResumes(centralId: string): Promise<IAgenticWorkbench[]> {
    await dbConnect()
    return AgenticWorkbench.find({ centralId, pendingTurn: { $ne: null } }).sort({ "pendingTurn.queuedAt": 1, _id: 1 }).lean()
}

/** Posição 1-based de cada mesa aguardando vaga (contada dentro da própria central). */
export async function slotQueuePositions(): Promise<Map<string, number>> {
    await dbConnect()
    const docs = await AgenticWorkbench.find({ pendingTurn: { $ne: null } }).select({ _id: 1, centralId: 1, pendingTurn: 1 }).sort({ "pendingTurn.queuedAt": 1, _id: 1 }).lean()
    const counters = new Map<string, number>()
    const positions = new Map<string, number>()
    for (const doc of docs) {
        const next = (counters.get(doc.centralId) ?? 0) + 1
        counters.set(doc.centralId, next)
        positions.set(String(doc._id), next)
    }
    return positions
}

export async function slotQueuePosition(workbenchId: string): Promise<number | null> {
    return (await slotQueuePositions()).get(workbenchId) ?? null
}
