import type { WorkbenchEvent, WorkbenchStreamLine } from "../types"
import { flushWorkbenchEvents, listWorkbenchEvents, subscribeWorkbench } from "./hub"
import { getWorkbench } from "./workflow"

const PING_MS = 15_000

/**
 * Stream NDJSON da mesa. Ordem sem buracos: assina o barramento (guardando o que chega), grava o
 * pendente, lê tudo do banco e só então repassa os eventos ao vivo com `seq` maior que o último lido.
 */
export async function openWorkbenchStream(id: string, signal: AbortSignal): Promise<Response> {
    await getWorkbench(id)
    const encoder = new TextEncoder()
    let cleanup = () => {}
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            let open = true
            const write = (line: WorkbenchStreamLine) => {
                if (!open) return
                try {
                    controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`))
                } catch {
                    open = false
                }
            }
            const queued: WorkbenchEvent[] = []
            let live = false
            let lastSeq = 0
            const forward = (event: WorkbenchEvent) => {
                if (event.seq !== undefined) {
                    if (event.seq <= lastSeq) return
                    lastSeq = event.seq
                }
                write(event)
            }
            const unsubscribe = subscribeWorkbench(id, (event) => (live ? forward(event) : queued.push(event)))
            const ping = setInterval(() => write({ type: "ping", ts: new Date().toISOString() }), PING_MS)
            ping.unref?.()
            cleanup = () => {
                if (!open) return
                open = false
                clearInterval(ping)
                unsubscribe()
                try {
                    controller.close()
                } catch {
                    // já fechado
                }
            }
            signal.addEventListener("abort", cleanup, { once: true })

            await flushWorkbenchEvents(id)
            write({ type: "reset" })
            for (const event of await listWorkbenchEvents(id)) forward(event)
            for (const event of queued) forward(event)
            queued.length = 0
            live = true
        },
        cancel() {
            cleanup()
        },
    })
    return new Response(stream, {
        headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
        },
    })
}
