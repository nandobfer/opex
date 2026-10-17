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

/** Falhas conhecidas do módulo: a UI explica o que fazer em vez de mostrar o texto cru do agente. */
export const ENVIRONMENT_FAILURE_CODES = [
    "ACCESS_ENVELOPE_MISSING",
    "ACCESS_TOKEN_REJECTED",
    "ACCESS_TOKEN_EXPIRED",
    "PREFLIGHT_UNVERIFIED",
    "AGENT_UNVERIFIED",
] as const
export type EnvironmentFailureCode = (typeof ENVIRONMENT_FAILURE_CODES)[number]

const FAILURE_HINTS: Record<EnvironmentFailureCode, string> = {
    ACCESS_ENVELOPE_MISSING:
        "O agente não recebeu o acesso protegido da operação. Confira a URL base do agente e o diretório de acesso em Integrações › Provedores de IA › Administração de sistema e use “Testar acesso do agente”.",
    ACCESS_TOKEN_REJECTED:
        "O acesso temporário da operação foi recusado. Repita a operação para gerar um novo acesso.",
    ACCESS_TOKEN_EXPIRED: "O acesso temporário da operação expirou. Repita a operação para gerar um novo acesso.",
    PREFLIGHT_UNVERIFIED: "A inspeção prévia não comprovou o estado do host. Nenhuma publicação foi autorizada.",
    AGENT_UNVERIFIED:
        "A operação terminou sem comprovação completa. Confira o estado registrado e reconcilie antes de repetir.",
}

/** Marcador de falha que o agente emite quando não consegue seguir (mesmo padrão do `OPEX_CHECKPOINT`). */
export function parseAgentFailure(text: string): EnvironmentFailureCode | null {
    const matches = [...text.matchAll(/OPEX_FAILURE\s+(\{[^\n]*\})/g)]
    const raw = matches.at(-1)?.[1]
    if (!raw) return null
    try {
        const code = (JSON.parse(raw) as { code?: unknown }).code
        return ENVIRONMENT_FAILURE_CODES.find((item) => item === code) ?? null
    } catch {
        return null
    }
}

/** Mensagem pt-BR para o código de falha; sem código conhecido, mantém a mensagem original. */
export function environmentFailureMessage(code: string | null | undefined, fallback: string): string {
    const known = ENVIRONMENT_FAILURE_CODES.find((item) => item === code)
    return known ? FAILURE_HINTS[known] : fallback
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
