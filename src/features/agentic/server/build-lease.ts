import { randomUUID } from "node:crypto"
import { BuildQueueLease } from "@/lib/db/models/BuildQueueLease"
import { logger } from "@/lib/logger"
/** Mutex persistente curto do despachante. O estado do participante protege o build em si. */
export async function withBuildQueueLease(run: () => Promise<void>): Promise<void> {
    const holder = randomUUID()
    let claimed = false
    try {
        const doc = await BuildQueueLease.findOneAndUpdate(
            { _id: "global", expiresAt: { $lte: new Date() } },
            { $set: { holder, expiresAt: new Date(Date.now() + 120000) } },
            { upsert: true, new: true },
        ).lean()
        claimed = doc?.holder === holder
    } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === 11000) return
        throw error
    }
    if (!claimed) return
    const timer = setInterval(() => {
        void BuildQueueLease.updateOne(
            { _id: "global", holder },
            { $set: { expiresAt: new Date(Date.now() + 120000) } },
        ).catch(() => logger.warn("[build-queue] Falha ao renovar reserva do despachante"))
    }, 30000)
    try {
        await run()
    } finally {
        clearInterval(timer)
        await BuildQueueLease.updateOne({ _id: "global", holder }, { $set: { expiresAt: new Date(0) } })
    }
}
