/** Regras puras do refinamento (cliente e servidor). */

/**
 * Título de seção de especificação técnica: `##` a `####`, tolerante a caixa e acento. Aceita texto
 * colado antes do título (blocos do turno que chegaram na mesma linha) e sufixo depois de "técnica"
 * iniciado por separador (`— X`, `: X`, `(X)`). Colado quer dizer sem espaço antes dos `#`: menção em
 * prosa (precedida de espaço) ou entre crases não é título.
 */
const SPEC_HEADING = /(?:^|[^#`\s])(#{2,4})[ \t]*especifica(?:ç|c)[aã]o[ \t]+t[eé]cnica([ \t]*[—–:(-].*)?$/i
const ANY_HEADING = /^(#{1,6})[ \t]+\S/

export interface TechnicalSpecExtraction {
    spec: string
    /** O título só foi reconhecido pela tolerância (texto colado antes ou sufixo depois). */
    tolerant: boolean
}

/**
 * Extrai a especificação técnica do texto do agente: a última seção cujo título é a especificação
 * técnica (aceita `## Especificação técnica`, `### Especificação Técnica`, sem acento, com texto colado
 * antes — descartado — ou com sufixo) até o próximo título de seção (`##`–`####`) de nível igual ou
 * superior, ou o fim. Títulos de nível 1 (`#`) fazem parte da seção. `null` quando ausente/vazia.
 */
export function extractTechnicalSpecDetail(text: string): TechnicalSpecExtraction | null {
    if (!text) return null
    const lines = text.split("\n")
    let start = -1
    let level = 2
    let tolerant = false
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index]!.trim()
        const match = SPEC_HEADING.exec(line)
        if (!match) continue
        start = index
        level = match[1]!.length
        const headingAt = match.index + match[0].indexOf(match[1]!)
        tolerant = headingAt > 0 || Boolean(match[2])
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
    return spec ? { spec, tolerant } : null
}

/** A especificação técnica do texto do agente (ver `extractTechnicalSpecDetail`). `null` quando ausente/vazia. */
export function extractTechnicalSpec(text: string): string | null {
    return extractTechnicalSpecDetail(text)?.spec ?? null
}

/** Motivo (pt-BR) quando o refinamento não está executando; `null` quando o agente trabalha. */
export function refinementWaitingReason(input: { runState: TaskRefinementRunState; pendingPermissions: number; pendingForms: number; resolved: boolean; closed?: boolean; queued?: boolean }): string | null {
    if (input.runState === "running") return null
    if (input.runState === "failed") return "O refinamento falhou — use Continuar"
    if (input.runState === "interrupted") return "Refinamento interrompido — use Continuar"
    if (input.pendingPermissions > 0) return "Aguardando você permitir uma ação"
    if (input.pendingForms > 0) return "Aguardando você responder uma pergunta"
    if (input.resolved) return "Especificação técnica esclarecida"
    if (input.closed) return "Refinamento encerrado"
    if (input.queued) return "Na fila da central: o refinamento começa quando a mesa abrir"
    return "O agente parou sem concluir a especificação — use Continuar"
}

export type TaskRefinementRunState = "idle" | "running" | "failed" | "interrupted"

/**
 * Refinamento concluído (OPE-137): especificação esclarecida e salva (`resolved`) ou encerrado pelo dono
 * na mesa (`closed`). É a mesma regra da abertura da mesa ("Abrir mesa e gerar o plano" bloqueado) e da
 * passagem de "Refinando" para "Especificação pronta".
 */
export function refinementConcluded(input: { resolved: boolean; closed: boolean } | null | undefined): boolean {
    return Boolean(input && (input.resolved || input.closed))
}
