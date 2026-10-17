import { agentResultSchema, type AgentResult } from "./schemas"

export function imageBuiltAt(images: AgentResult["images"]): Date | null {
    if (!images.length || images.some((image) => !image.builtAt)) return null
    return new Date(Math.max(...images.map((image) => Date.parse(image.builtAt!))))
}

export function composeProject(repo: string, slug: string): string {
    const normalized = repo
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
    return `${normalized}-${slug}`
}
export function restoreCompatibility(
    current: string | null,
    target: string | null,
): "compatible" | "blocked" | "unknown" {
    if (!current || !target) return "unknown"
    return current === target ? "compatible" : "blocked"
}
export function parseAgentResult(text: string): AgentResult | null {
    const blocks = [...text.matchAll(/```json\s*([\s\S]*?)```/g)]
    try {
        return agentResultSchema.parse(JSON.parse(blocks.at(-1)?.[1] ?? text))
    } catch {
        return null
    }
}
/** Log/Compose livre não é DTO seguro: expurgar credenciais e valores conhecidos antes de persistir. */
export function redact(text: string, secrets: string[] = []): string {
    let result = text
    for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length))
        result = result.split(secret).join("[protegido]")
    return result
        .replace(/(Bearer\s+)\S+/gi, "$1[protegido]")
        .replace(
            /(\b(?:password|passwd|token|secret|api[_-]?key|authorization)\b\s*[=:]\s*)[^\s,;]+/gi,
            "$1[protegido]",
        )
        .replace(/(\w+:\/\/)[^\s/@]+:[^\s/@]+@/g, "$1[protegido]@")
}
