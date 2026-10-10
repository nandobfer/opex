/** Regras puras do refinamento (cliente e servidor). */

/** Título de seção de especificação técnica: `##` a `####`, tolerante a caixa e acento. */
const SPEC_HEADING = /^(#{2,4})[ \t]*especifica(?:ç|c)[aã]o[ \t]+t[eé]cnica[ \t]*$/i
const ANY_HEADING = /^(#{1,6})[ \t]+\S/

/**
 * Extrai a especificação técnica do texto do agente: a última seção cujo título é a especificação
 * técnica (aceita `## Especificação técnica`, `### Especificação Técnica`, sem acento etc.) até o
 * próximo título de seção (`##`–`####`) de nível igual ou superior, ou o fim. Títulos de nível 1
 * (`#`) fazem parte da seção. `null` quando ausente/vazia.
 */
export function extractTechnicalSpec(text: string): string | null {
    if (!text) return null
    const lines = text.split("\n")
    let start = -1
    let level = 2
    for (let index = 0; index < lines.length; index++) {
        const match = SPEC_HEADING.exec(lines[index]!.trim())
        if (match) {
            start = index
            level = match[1]!.length
        }
    }
    if (start < 0) return null
    const body: string[] = []
    for (let index = start + 1; index < lines.length; index++) {
        const heading = ANY_HEADING.exec(lines[index]!.trim())
        const headingLevel = heading?.[1]?.length ?? 0
        if (headingLevel >= 2 && headingLevel <= level) break
        body.push(lines[index]!)
    }
    const spec = body.join("\n").trim()
    return spec || null
}

/** Motivo (pt-BR) quando o refinamento não está executando; `null` quando o agente trabalha. */
export function refinementWaitingReason(input: { runState: TaskRefinementRunState; pendingPermissions: number; pendingForms: number; resolved: boolean }): string | null {
    if (input.runState === "running") return null
    if (input.runState === "failed") return "O refinamento falhou — use Continuar"
    if (input.runState === "interrupted") return "Refinamento interrompido — use Continuar"
    if (input.pendingPermissions > 0) return "Aguardando você permitir uma ação"
    if (input.pendingForms > 0) return "Aguardando você responder uma pergunta"
    if (input.resolved) return "Especificação técnica esclarecida"
    return "O agente parou sem concluir a especificação — use Continuar"
}

export type TaskRefinementRunState = "idle" | "running" | "failed" | "interrupted"
