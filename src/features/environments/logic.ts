import { agentResultSchema, dbEvidenceSchema, type AgentResult, type DbEvidence } from "./schemas"

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
/** Resposta do turno de versão do banco (último bloco ```json). */
export function parseDbEvidence(text: string): DbEvidence | null {
    const blocks = [...text.matchAll(/```json\s*([\s\S]*?)```/g)]
    try {
        return dbEvidenceSchema.parse(JSON.parse(blocks.at(-1)?.[1] ?? text))
    } catch {
        return null
    }
}

/** Falhas conhecidas do módulo: a UI explica o que fazer além da mensagem da operação. */
export const ENVIRONMENT_FAILURE_CODES = [
    "HOST_UNREACHABLE",
    "ACCESS_WRITE_FAILED",
    "HOST_COMMAND_FAILED",
    "COMPOSE_NOT_FOUND",
    "PREFLIGHT_UNVERIFIED",
    "RESULT_UNVERIFIED",
    "AGENT_UNVERIFIED",
] as const
export type EnvironmentFailureCode = (typeof ENVIRONMENT_FAILURE_CODES)[number]

const FAILURE_HINTS: Record<EnvironmentFailureCode, string> = {
    HOST_UNREACHABLE:
        "O Opex não conseguiu executar comandos no host pelo OpenCode. Confira a integração do OpenCode e use “Testar acesso ao host” em Integrações › Provedores de IA › Administração de sistema.",
    ACCESS_WRITE_FAILED:
        "O acesso temporário não pôde ser gravado no host. Confira o diretório de acesso (e as credenciais SSH, no acesso remoto) e use “Testar acesso ao host”.",
    HOST_COMMAND_FAILED: "O host recusou um comando do Docker. Confira se o Docker está ativo e acessível ao usuário do OpenCode.",
    COMPOSE_NOT_FOUND: "Confira o diretório e o arquivo Compose nas configurações do ambiente.",
    PREFLIGHT_UNVERIFIED: "A inspeção prévia não comprovou o estado do host. Nenhuma alteração foi feita.",
    RESULT_UNVERIFIED:
        "O agente terminou, mas a conferência no host não encontrou os containers esperados. Inspecione o ambiente antes de repetir.",
    AGENT_UNVERIFIED:
        "A operação terminou sem comprovação completa. Inspecione o ambiente e confira o estado antes de repetir.",
}

/** Orientação pt-BR para o código de falha (ou `null` quando o código não é conhecido). */
export function environmentFailureHint(code: string | null | undefined): string | null {
    const known = ENVIRONMENT_FAILURE_CODES.find((item) => item === code)
    return known ? FAILURE_HINTS[known] : null
}

/** Prova de que os containers esperados estão de pé depois da ação (independente do texto do agente). */
export function verifyHostResult(
    kind: "publish" | "restore",
    observed: { images: AgentResult["images"]; containers: { service: string; state: string }[] },
    expected: { services: string[]; images?: AgentResult["images"]; since?: Date | null },
): boolean {
    const running = (service: string) =>
        observed.containers.some((container) => container.service === service && container.state === "running")
    if (kind === "restore") {
        const images = expected.images ?? []
        return (
            images.length > 0 &&
            images.every(
                (image) =>
                    running(image.service) &&
                    observed.images.some((actual) => actual.service === image.service && actual.imageId === image.imageId),
            )
        )
    }
    const services = expected.services.length ? expected.services : observed.images.map((image) => image.service)
    if (!services.length || !services.every(running)) return false
    // CD: ao menos uma imagem construída depois do disparo comprova a nova versão.
    if (expected.since)
        return observed.images.some(
            (image) => services.includes(image.service) && image.builtAt && Date.parse(image.builtAt) >= expected.since!.getTime(),
        )
    return true
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
