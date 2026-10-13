import { dbConnect } from "@/lib/db"
import { EnvironmentOperation, type IEnvironmentOperation } from "@/lib/db/models/EnvironmentOperation"
import { waitingBuilds, hasActiveAgenticBuild } from "@/features/agentic/server/build-queue"

/**
 * Fila das publicações **locais**: compartilha o mesmo "um build por vez" da prévia agêntica (que
 * roda no Docker da máquina). A fila é **derivada** (operações `publish` + `local` + `queued`, FIFO);
 * hosts **remotos** são serializados por ambiente (não entram nesta fila).
 */

export async function waitingLocalOperations(): Promise<IEnvironmentOperation[]> {
    await dbConnect()
    return EnvironmentOperation.find({ type: "publish", method: "local", status: "queued" }).sort({ createdAt: 1, _id: 1 }).lean()
}

/** Posição 1-based por ambiente na fila local (vazio quando ninguém aguarda). */
export async function localQueuePositions(): Promise<Map<string, number>> {
    const queue = await waitingLocalOperations()
    const map = new Map<string, number>()
    queue.forEach((operation, index) => map.set(operation.environmentId, index + 1))
    return map
}

export async function localQueuePosition(environmentId: string): Promise<number | null> {
    return (await localQueuePositions()).get(environmentId) ?? null
}

/** Builds agênticos aguardando a vez (para a tela somar as duas filas). */
export async function agenticWaitingCount(): Promise<number> {
    return (await waitingBuilds()).length
}

/** Há um build local em andamento (prévia agêntica ou publicação de ambiente)? */
export async function isAnyLocalBuildRunning(): Promise<boolean> {
    await dbConnect()
    const running = await EnvironmentOperation.findOne({ method: "local", status: "running" }).select({ _id: 1 }).lean()
    if (running) return true
    return hasActiveAgenticBuild()
}
