import { SECRETARY_MAX_PARTS } from "./constants"

/**
 * Divide a resposta em mensagens curtas, como o dono faz (pura). O modelo separa as mensagens com uma linha
 * em branco; parágrafos longos ainda são quebrados no fim de frase. No máximo `maxParts` partes: o que
 * sobra vai junto na última.
 */
export function splitMessages(text: string, options: { enabled: boolean; maxChars?: number; maxParts?: number } = { enabled: true }): string[] {
    const clean = text.replace(/\r\n/g, "\n").trim()
    if (!clean) return []
    if (!options.enabled) return [clean]
    const maxChars = options.maxChars ?? 280
    const maxParts = options.maxParts ?? SECRETARY_MAX_PARTS
    const parts: string[] = []
    for (const paragraph of clean.split(/\n\s*\n/)) {
        const trimmed = paragraph.trim()
        if (!trimmed) continue
        if (trimmed.length <= maxChars) {
            parts.push(trimmed)
            continue
        }
        let current = ""
        for (const sentence of trimmed.split(/(?<=[.!?…])\s+/)) {
            if (current && (current + " " + sentence).length > maxChars) {
                parts.push(current)
                current = sentence
            } else current = current ? `${current} ${sentence}` : sentence
        }
        if (current) parts.push(current)
    }
    if (parts.length <= maxParts) return parts
    return [...parts.slice(0, maxParts - 1), parts.slice(maxParts - 1).join("\n\n")]
}

/** Atraso aleatório (ms) entre `min` e `max` segundos. */
export function randomDelayMs(minSeconds: number, maxSeconds: number, random: () => number = Math.random): number {
    const min = Math.max(0, Math.min(minSeconds, maxSeconds))
    const max = Math.max(minSeconds, maxSeconds)
    return Math.round((min + random() * (max - min)) * 1000)
}

/** Tempo de "digitando…" de uma parte, proporcional ao tamanho (1,2 s a 6 s). */
export function typingMs(text: string): number {
    return Math.min(6000, Math.max(1200, text.length * 45))
}
