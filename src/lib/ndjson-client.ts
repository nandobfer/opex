
/** Evento genérico de stream NDJSON (cada rota define o próprio formato; `type` é comum a todos). */
export type NdjsonEvent = { type: string } & Record<string, unknown>

/**
 * Faz `POST` num endpoint NDJSON do app (`/api/...`) e chama `onEvent` linha a linha. Resposta de
 * erro antes do stream (JSON) vira `Error` com a mensagem do servidor.
 */
export async function readNdjson<T extends { type: string } = NdjsonEvent>(path: string, onEvent: (event: T) => void, options: { body?: unknown; signal?: AbortSignal } = {}): Promise<void> {
    const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options.body ?? {}),
        signal: options.signal,
    })
    if (!res.ok || !res.body) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? "Não foi possível concluir a requisição")
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
            if (!line.trim()) continue
            try {
                onEvent(JSON.parse(line) as T)
            } catch {
                // Linha parcial/inválida: ignora.
            }
        }
    }
}
