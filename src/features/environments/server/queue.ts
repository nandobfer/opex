import { EnvironmentOperation } from "@/lib/db/models/EnvironmentOperation"
import { Environment } from "@/lib/db/models/Environment"
import { dbConnect } from "@/lib/db"
import { registerBuildParticipant } from "@/features/agentic/server/build-participants"
import { pumpBuildQueue } from "@/features/agentic/server/build-queue"
import { executeEnvironment, isEnvironmentRunning } from "./runner"
import { logger } from "@/lib/logger"
import { getOpencodeClient } from "@/lib/ai/opencode-client"
import { loadEnvironmentSettings } from "@/features/ai/server/settings"
import { removeAccess } from "./host"

async function start(id: string) {
    const op = await EnvironmentOperation.findOneAndUpdate(
        { _id: id, state: "queued" },
        { $set: { state: "running", startedAt: new Date(), heartbeatAt: new Date() } },
        { new: true },
    ).lean()
    if (!op) return false
    void executeEnvironment(id).catch(() => logger.error({ operationId: id }, "[environments] Falha no coordenador"))
    return true
}
registerBuildParticipant("environments", {
    waiting: async () => {
        const ops = await EnvironmentOperation.find({
            state: "queued",
            "repoConfig.mode": "local",
            kind: "publish",
            method: "host",
        })
            .sort({ createdAt: 1, _id: 1 })
            .lean()
        return ops.map((op) => ({ id: String(op._id), queuedAt: op.createdAt, start: () => start(String(op._id)) }))
    },
    // Estado persistido bloqueia inclusive durante reconciliação após reinício.
    active: async () =>
        Boolean(
            await EnvironmentOperation.exists({
                state: { $in: ["running", "reconciling"] },
                "repoConfig.mode": "local",
                kind: "publish",
                method: "host",
            }),
        ),
})
let pumping: Promise<void> | null = null
export function pumpEnvironments(): Promise<void> {
    if (pumping) return pumping
    pumping = pump()
        .catch(() => logger.warn("[environments] Falha ao processar operações"))
        .finally(() => {
            pumping = null
        })
    return pumping
}
async function pump() {
    await dbConnect()
    const waiting = await EnvironmentOperation.find({ state: "queued" }).sort({ createdAt: 1, _id: 1 }).lean()
    for (const op of waiting)
        if (!(op.repoConfig.mode === "local" && op.kind === "publish" && op.method === "host"))
            await start(String(op._id))
    await pumpBuildQueue()
}
export async function reconcileEnvironments() {
    await dbConnect()
    // Queda entre a reserva atômica e a criação da operação: nenhum agente pode ter iniciado.
    const reserved = await Environment.find({
        activeOperationId: { $ne: null },
        updatedAt: { $lt: new Date(Date.now() - 90000) },
    }).lean()
    for (const env of reserved)
        if (!(await EnvironmentOperation.exists({ _id: env.activeOperationId }))) {
            await Environment.updateOne(
                { _id: env._id, activeOperationId: env.activeOperationId },
                { $set: { activeOperationId: null } },
            )
        }
    // Acesso que ficou no host (limpeza falhou ao terminar): removido pelo shell do OpenCode.
    const cleanup = await EnvironmentOperation.find({
        state: { $nin: ["queued", "running", "reconciling"] },
        accessPath: { $ne: null },
    })
        .select("+accessPath")
        .lean()
    if (cleanup.length) {
        try {
            const { settings } = await loadEnvironmentSettings()
            const client = await getOpencodeClient()
            for (const op of cleanup) {
                if (!op.accessPath) continue
                await removeAccess(client, settings, op.accessPath)
                    .then(() => EnvironmentOperation.updateOne({ _id: op._id }, { $set: { accessPath: null } }))
                    .catch(() => logger.warn({ operationId: String(op._id) }, "[environments] Limpeza de acesso pendente"))
            }
        } catch {
            logger.warn("[environments] OpenCode indisponível para limpar acessos; nova tentativa no próximo tick")
        }
    }
    const operations = await EnvironmentOperation.find({ state: { $in: ["running", "reconciling"] } })
        .sort({ createdAt: 1 })
        .lean()
    for (const op of operations) {
        if (isEnvironmentRunning(String(op._id))) continue
        if (op.heartbeatAt && Date.now() - op.heartbeatAt.getTime() < 90_000) continue
        const claimed = await EnvironmentOperation.updateOne(
            { _id: op._id, heartbeatAt: op.heartbeatAt },
            { $set: { state: "reconciling", heartbeatAt: new Date() } },
        )
        if (claimed.modifiedCount)
            void executeEnvironment(String(op._id), true).catch(() =>
                logger.warn("[environments] Reconciliação pendente"),
            )
    }
    await pumpEnvironments()
}
