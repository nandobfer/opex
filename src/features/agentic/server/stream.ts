import { logger } from "@/lib/logger"
import type { WorkbenchEvent, WorkbenchStreamLine } from "../types"
import { flushWorkbenchEvents, streamWorkbenchEvents, subscribeWorkbench } from "./hub"
import { assertWorkbenchExists } from "./workflow"

const PING_MS = 15_000

/**
 * Stream NDJSON de uma execução longa (mesa ou refinamento): assina o barramento (guardando o que
 * chega), grava o pendente, manda `reset`, escreve o histórico do banco conforme o cursor lê, fecha o
 * histórico com `ready` e só então repassa os eventos ao vivo com `seq` maior que o último lido.
 * `verify` confere a existência da execução (404 antes de abrir o stream).
 */
export async function openEventStream(id: string, signal: AbortSignal, verify?: (id: string) => Promise<unknown>): Promise<Response> {
    if (verify) await verify(id)
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
            try {
                for await (const event of streamWorkbenchEvents(id, () => open && !signal.aborted)) forward(event)
            } catch (error) {
                // Falha ao ler o histórico: fecha o stream (o cliente reconecta e relê, mantendo a saída exibida).
                logger.warn({ err: error, id }, "[agentic] Falha ao ler o histórico da saída")
                cleanup()
                return
            }
            if (!open) return
            for (const event of queued) forward(event)
            queued.length = 0
            write({ type: "ready" })
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

/** Stream da mesa de trabalho: exige que a mesa exista (só a existência; o DTO vem do `by-task`). */
export function openWorkbenchStream(id: string, signal: AbortSignal): Promise<Response> {
    return openEventStream(id, signal, assertWorkbenchExists)
}
