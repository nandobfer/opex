import { dbConnect } from "@/lib/db"
import { AgenticWorkbench, type IAgenticWorkbench } from "@/lib/db/models/Agentic"
import { logger } from "@/lib/logger"
import { isWorkbenchActive } from "./hub"

/**
 * Fila **global** do build: uma mesa que termina a implementação entra em `build_queued` e espera a
 * vez. Um único build roda por vez em toda a máquina: o motor (`pumpBuildQueue`) só inicia o próximo
 * quando não há nenhum turno de build **vivo neste processo**.
 *
 * A fila é **derivada** (sem coleção própria) — mesas em `build_queued`, na ordem de chegada
 * (`buildQueuedAt`, FIFO). O motor roda em segundo plano no servidor e é acionado no fim da
 * implementação, no fim de cada build (sucesso ou falha) e pela rotina `agentic-queue-pump` (Crons),
 * que cobre reinícios. O import do workflow é **dinâmico** para evitar ciclo estático (o workflow
 * importa este módulo estaticamente).
 */

/** Builds de fora das mesas (ex.: deploy de Ambientes): em andamento neste processo e a vez entre eles. */
const EXTERNAL_KEY = Symbol.for("opex.build-queue.external")
const externalStore = globalThis as unknown as Record<symbol, { active: number; turn: Promise<void> } | undefined>
const external = () => (externalStore[EXTERNAL_KEY] ??= { active: 0, turn: Promise.resolve() })

/**
 * Roda um build de fora das mesas na vez da fila global: um externo por vez, depois de nenhum build de
 * mesa estar em andamento; ocupa a vez durante `run` e, ao terminar, aciona a fila das mesas.
 */
export async function runExclusiveBuild<T>(run: () => Promise<T>, options: { pollMs?: number; signal?: AbortSignal } = {}): Promise<T> {
    const pollMs = options.pollMs ?? 5_000
    const state = external()
    const previous = state.turn
    let done!: () => void
    state.turn = new Promise<void>((resolve) => (done = resolve))
    try {
        await previous
        while (await hasActiveBuild()) {
            if (options.signal?.aborted) throw new Error("Build cancelado na fila")
            await new Promise((resolve) => setTimeout(resolve, pollMs))
        }
        state.active += 1
        try {
            return await run()
        } finally {
            state.active -= 1
            void pumpBuildQueue()
        }
    } finally {
        done()
    }
}

/** Um build está em andamento? Conta a mesa `building`/`running` com turno vivo neste processo e os builds externos. */
async function hasActiveBuild(): Promise<boolean> {
    if (external().active > 0) return true
    const building = await AgenticWorkbench.find({ stage: "building", runState: "running" }).select({ _id: 1, previewBuild: 1 }).lean()
    return building.some((item) => item.previewBuild?.method !== "github" && isWorkbenchActive(String(item._id)))
}

/** Mesas aguardando a vez do build, na ordem de chegada (FIFO). */
export async function waitingBuilds(): Promise<IAgenticWorkbench[]> {
    await dbConnect()
    return AgenticWorkbench.find({ stage: "build_queued" }).sort({ buildQueuedAt: 1, _id: 1 }).lean()
}

/** Posição 1-based na fila por mesa (vazio quando não há ninguém aguardando). */
export async function buildQueuePositions(): Promise<Map<string, number>> {
    const queue = await waitingBuilds()
    return new Map(queue.map((item, index) => [String(item._id), index + 1]))
}

/** Posição 1-based da mesa na fila do build (`null` quando ela não está aguardando a vez). */
export async function buildQueuePosition(workbenchId: string): Promise<number | null> {
    return (await buildQueuePositions()).get(workbenchId) ?? null
}

let pumpChain: Promise<void> | null = null

/**
 * Processa a fila global do build. Serializado (chain em memória) para nunca iniciar dois builds;
 * nunca lança. Acionado pelo workflow e pela rotina `agentic-queue-pump`.
 */
export function pumpBuildQueue(): Promise<void> {
    const previous = pumpChain ?? Promise.resolve()
    const next = previous.then(() => runBuildPump()).catch(() => undefined)
    pumpChain = next
    return next
}

/** Inicia o próximo build da fila se não houver nenhum em andamento. Nunca lança. */
async function runBuildPump(): Promise<void> {
    try {
        await dbConnect()
        if (await hasActiveBuild()) return
        // Import dinâmico: o workflow depende deste módulo (busca posições e dispara o motor).
        const { startBuildTurn } = await import("./workflow")
        for (const item of await waitingBuilds()) {
            try {
                // `false` = a mesa saiu da fila (ex.: o usuário pediu correção); tenta a próxima.
                if (await startBuildTurn(String(item._id))) break
            } catch (error) {
                logger.warn({ err: error, workbenchId: String(item._id) }, "[agentic-build-queue] Build não iniciado para a mesa da fila")
                break
            }
        }
    } catch (error) {
        logger.error({ err: error }, "[agentic-build-queue] Falha ao processar a fila do build")
    }
}
