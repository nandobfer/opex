import { Socket } from "net"
import { DomainError } from "@/lib/api/route"
import { AgenticWorkbench } from "@/lib/db/models/Agentic"
import { pickPreviewPort } from "../logic"

/**
 * Portas das prévias: faixa efetiva da central (a padrão global de "Configurações Padrão" ou a
 * própria, quando personalizada), reservadas no banco
 * (índice único em `port`) e conferidas no host — uma porta ocupada por outro processo é pulada.
 */

/** Algo responde nessa porta? (conexão TCP com tempo curto). */
export function isPortInUse(host: string, port: number, timeoutMs = 800): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = new Socket()
        const done = (inUse: boolean) => {
            socket.destroy()
            resolve(inUse)
        }
        socket.setTimeout(timeoutMs)
        socket.once("connect", () => done(true))
        socket.once("timeout", () => done(false))
        socket.once("error", () => done(false))
        socket.connect(port, host)
    })
}

/** Reserva a porta da mesa (mantém a atual, se já tiver uma). */
export async function allocatePreviewPort(workbenchId: string, host: string, range: { min: number; max: number }, check: (host: string, port: number) => Promise<boolean> = isPortInUse): Promise<number> {
    const current = await AgenticWorkbench.findById(workbenchId).select({ port: 1 }).lean()
    if (typeof current?.port === "number") return current.port
    const skipped = new Set<number>()
    for (let attempt = 0; attempt <= range.max - range.min; attempt++) {
        const reserved = await AgenticWorkbench.find({ port: { $ne: null } }).select({ port: 1 }).lean()
        const port = pickPreviewPort([...reserved.map((item) => item.port as number), ...skipped], range.min, range.max)
        if (port === null) break
        if (await check(host, port)) {
            skipped.add(port)
            continue
        }
        try {
            const result = await AgenticWorkbench.updateOne({ _id: workbenchId, port: null }, { $set: { port } })
            if (result.modifiedCount === 1) return port
            const again = await AgenticWorkbench.findById(workbenchId).select({ port: 1 }).lean()
            if (typeof again?.port === "number") return again.port
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) throw error
            skipped.add(port)
        }
    }
    throw new DomainError(409, `Nenhuma porta livre entre ${range.min} e ${range.max}: conclua ou exclua mesas antigas`, "NO_FREE_PORT")
}

export async function releasePreviewPort(workbenchId: string): Promise<void> {
    await AgenticWorkbench.updateOne({ _id: workbenchId }, { $set: { port: null } })
}

/** Espera a prévia responder (qualquer status abaixo de 500) até o prazo. */
export async function waitForPreview(url: string, timeoutMs = 90_000, intervalMs = 3_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        try {
            const res = await fetch(url, { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(5_000) })
            if (res.status < 500) return true
        } catch {
            // ainda subindo
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
    return false
}
