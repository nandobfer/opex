import { emptyDraft } from "../stream-parser"
import type { ArchitectStreamLine } from "../types"
import { getDiagram } from "./diagrams"
import { subscribeLive } from "./live-hub"

const PING_MS = 15_000

/**
 * Stream NDJSON do diagrama ao vivo (`GET /api/architect/diagrams/[id]/stream`): `snapshot` (rascunho
 * e progresso, com o `seq`), depois `ops` numeradas e `progress`, com `ping` a cada 15 s, e `end` com o
 * estado final. Sem geração viva neste processo, o retrato vem do rascunho gravado e o stream fecha
 * com `end`. Reconectar recomeça pelo retrato: nada se perde.
 */
export async function openDiagramStream(diagramId: string, signal: AbortSignal): Promise<Response> {
    const diagram = await getDiagram(diagramId)
    const encoder = new TextEncoder()
    let cleanup = () => {}
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            let open = true
            const close = () => {
                if (!open) return
                open = false
                cleanup()
                try {
                    controller.close()
                } catch {
                    // já fechado
                }
            }
            const write = (line: ArchitectStreamLine) => {
                if (!open) return
                try {
                    controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`))
                } catch {
                    open = false
                }
                if (line.type === "end") close()
            }
            // Assina antes do retrato: nenhuma operação fica entre os dois.
            const subscription = subscribeLive(diagramId, write)
            if (!subscription) {
                const graph = diagram.graph ?? diagram.draft ?? emptyDraft()
                write({ type: "snapshot", seq: 0, live: false, graph, progress: { phase: diagram.phase, tools: diagram.tools, nodes: graph.nodes.length, edges: graph.edges.length } })
                write({ type: "end", state: diagram.state })
                return
            }
            const ping = setInterval(() => write({ type: "ping" }), PING_MS)
            ping.unref?.()
            cleanup = () => {
                clearInterval(ping)
                subscription.unsubscribe()
            }
            write(subscription.snapshot)
            signal.addEventListener("abort", close, { once: true })
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
