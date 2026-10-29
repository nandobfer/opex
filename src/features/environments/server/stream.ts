import { isValidObjectId } from "mongoose"
import { DomainError } from "@/lib/api/route"
import type { DeployEvent } from "../types"
import { hasLiveDeploy, subscribeDeploy } from "./hub"
import { EnvironmentDeploy, environmentsDb, type IEnvironmentDeploy } from "./models"
import { ensureDeployResumed } from "./resume"

const PING_MS = 15_000

/**
 * Log de um deploy em NDJSON: `log` com o que já saiu e, ao vivo, os pedaços novos até o `status`
 * final. Deploy já encerrado: o log gravado e o status. Em andamento fora da memória (o app reiniciou
 * no meio): retoma o deploy e segue ao vivo; se outro processo vivo cuida dele, manda o log gravado e
 * fecha sem `status` — o cliente reconecta.
 */
export async function openDeployStream(deployId: string, signal: AbortSignal): Promise<Response> {
    if (!isValidObjectId(deployId)) throw new DomainError(404, "Deploy não encontrado")
    await environmentsDb()
    let saved = await EnvironmentDeploy.findById(deployId).lean<IEnvironmentDeploy>()
    if (!saved) throw new DomainError(404, "Deploy não encontrado")
    if (saved.status === "running" && !hasLiveDeploy(deployId) && (await ensureDeployResumed(deployId)) === "other") {
        saved = (await EnvironmentDeploy.findById(deployId).lean<IEnvironmentDeploy>()) ?? saved
    }
    const final = saved
    const encoder = new TextEncoder()
    let cleanup = () => {}
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            let closed = false
            const write = (event: DeployEvent | { type: "ping" }) => {
                if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
            }
            const close = () => {
                if (closed) return
                closed = true
                cleanup()
                controller.close()
            }
            const live = final.status === "running" ? subscribeDeploy(deployId, (event) => {
                write(event)
                if (event.type === "status" && event.status !== "running") close()
            }) : null
            if (!live) {
                write({ type: "log", text: final.log })
                if (final.status !== "running") write({ type: "status", status: final.status, error: final.error })
                close()
                return
            }
            write({ type: "log", text: live.log })
            const ping = setInterval(() => write({ type: "ping" }), PING_MS)
            ping.unref?.()
            cleanup = () => {
                clearInterval(ping)
                live.unsubscribe()
                signal.removeEventListener("abort", close)
            }
            signal.addEventListener("abort", close, { once: true })
            if (live.done) {
                const ended = await EnvironmentDeploy.findById(deployId).select({ status: 1, error: 1 }).lean<IEnvironmentDeploy>()
                write({ type: "status", status: ended?.status === "success" ? "success" : "failed", error: ended?.error ?? null })
                close()
            }
        },
        cancel() {
            cleanup()
        },
    })
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } })
}
