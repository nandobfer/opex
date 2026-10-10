import { REFINEMENT_SPEC_HEADING } from "./constants"

/** Regras puras do refinamento (cliente e servidor). */

/**
 * Extrai a especificação técnica do texto do agente: a última seção sob
 * `## Especificação técnica` até o próximo título de nível 2 (ou o fim). `null` quando ausente/vazia.
 */
export function extractTechnicalSpec(text: string, heading: string = REFINEMENT_SPEC_HEADING): string | null {
    const index = text.lastIndexOf(heading)
    if (index < 0) return null
    const after = text.slice(index + heading.length)
    const next = after.search(/\n##\s/)
    const body = (next >= 0 ? after.slice(0, next) : after).trim()
    return body || null
}

/** Motivo (pt-BR) quando o refinamento não está executando; `null` quando o agente trabalha. */
export function refinementWaitingReason(input: { runState: TaskRefinementRunState; pendingPermissions: number; pendingForms: number; resolved: boolean }): string | null {
    if (input.runState === "running") return null
    if (input.runState === "failed") return "O refinamento falhou — use Continuar"
    if (input.runState === "interrupted") return "Refinamento interrompido — use Continuar"
    if (input.pendingPermissions > 0) return "Aguardando você permitir uma ação"
    if (input.pendingForms > 0) return "Aguardando você responder uma pergunta"
    if (input.resolved) return "Especificação técnica esclarecida"
    return null
}

export type TaskRefinementRunState = "idle" | "running" | "failed" | "interrupted"
