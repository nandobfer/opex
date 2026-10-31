import type { ApplyEvent, ApplyStateDto } from "../types"

/**
 * "Aplicar e reiniciar" em andamento neste processo: um por vez, com o log acumulado e os ouvintes
 * do stream NDJSON. Fechar a tela não interrompe (o comando roda desacoplado no host).
 */

interface ApplyRun extends ApplyStateDto {
    log: string
    listeners: Set<(event: ApplyEvent) => void>
}

const KEY = Symbol.for("opex.engramind.apply")
const store = globalThis as unknown as Record<symbol, ApplyRun | null | undefined>

export function currentApply(): ApplyRun | null {
    return store[KEY] ?? null
}

export function applyState(): ApplyStateDto | null {
    const run = currentApply()
    return run ? { id: run.id, status: run.status, startedAt: run.startedAt, finishedAt: run.finishedAt, error: run.error } : null
}

export function startApplyRun(id: string): ApplyRun {
    const run: ApplyRun = { id, status: "running", startedAt: new Date().toISOString(), finishedAt: null, error: null, log: "", listeners: new Set() }
    store[KEY] = run
    return run
}

export function emitApply(run: ApplyRun, event: ApplyEvent): void {
    if (event.type === "log") run.log += event.text
    if (event.type === "status") {
        run.status = event.status
        run.error = event.error
        run.finishedAt = new Date().toISOString()
    }
    for (const listener of run.listeners) listener(event)
}

export function resetApplyHub(): void {
    store[KEY] = null
}

/** NDJSON com o log até agora e, ao vivo, os pedaços novos até o `status` final. */
export function openApplyStream(signal: AbortSignal): Response {
    const run = currentApply()
    const encoder = new TextEncoder()
    let cleanup = () => {}
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            let closed = false
            const write = (event: ApplyEvent) => {
                if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
            }
            const close = () => {
                if (closed) return
                closed = true
                cleanup()
                controller.close()
            }
            if (!run) {
                close()
                return
            }
            write({ type: "log", text: run.log })
            if (run.status !== "running") {
                write({ type: "status", status: run.status, error: run.error })
                close()
                return
            }
            const listener = (event: ApplyEvent) => {
                write(event)
                if (event.type === "status") close()
            }
            run.listeners.add(listener)
            const ping = setInterval(() => write({ type: "ping" }), 15_000)
            ping.unref?.()
            cleanup = () => {
                clearInterval(ping)
                run.listeners.delete(listener)
                signal.removeEventListener("abort", close)
            }
            signal.addEventListener("abort", close, { once: true })
        },
        cancel() {
            cleanup()
        },
    })
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } })
}
