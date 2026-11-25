import { parseDocument } from "yaml"
import { MANAGED_COMPOSE_MAX_BYTES } from "./constants"

/**
 * Regras (puras) do compose gerenciado (OPE-191): o `docker-compose.yml` escrito no Opex e guardado em
 * revisões. A tela valida enquanto o dono digita e o servidor repete a mesma validação (422). A
 * validação completa do compose continua no deploy (`docker compose config`).
 */

export interface ComposeContentProblem {
    message: string
    /** Linha do erro do YAML (1 = primeira), quando houver. */
    line: number | null
}

/** Tamanho do conteúdo em bytes (UTF-8). */
export const composeBytes = (content: string) => new TextEncoder().encode(content).length

/** "12,3 KB". */
export function formatComposeSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    return `${(bytes / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB`
}

/** Problema do conteúdo do compose (`null` = ok): vazio, acima do limite ou YAML inválido (com a linha). */
export function composeContentProblem(content: string): ComposeContentProblem | null {
    if (!content.trim()) return { message: "Escreva o compose (YAML)", line: null }
    const bytes = composeBytes(content)
    if (bytes > MANAGED_COMPOSE_MAX_BYTES) return { message: `O compose passa do limite de ${formatComposeSize(MANAGED_COMPOSE_MAX_BYTES)} (tem ${formatComposeSize(bytes)})`, line: null }
    const error = parseDocument(content).errors[0]
    if (!error) return null
    const line = error.linePos?.[0]?.line ?? null
    const reason = (error.message.split("\n")[0] ?? "").replace(/ at line \d+, column \d+:?$/, "").trim()
    return { message: line ? `YAML inválido na linha ${line}: ${reason}` : `YAML inválido: ${reason}`, line }
}

/** Quem gravou a revisão (o app do dono só tem o usuário local). */
export function authorLabel(authorId: string): string {
    return authorId === "local" ? "Dono" : authorId
}

/**
 * Há revisão do compose mais nova que a implantada: só para ambiente gerenciado já implantado (o nunca
 * implantado já aparece como "Nunca implantado").
 */
export function composeNotDeployed(env: { source: { kind: string; composeVersion?: number }; deployedOn: unknown; deployedComposeVersion: number | null }): boolean {
    if (env.source.kind !== "managed" || !env.deployedOn) return false
    return env.deployedComposeVersion !== (env.source.composeVersion ?? null)
}
