import type { MemoryConsumer } from "./agents"

/**
 * Foco do contexto das memórias por turno (OPE-117; módulo PURO). O Engramind 0.11.0 recebe em
 * `GET /v1/context?focus=` o texto da tarefa ou da conversa e põe antes, dentro de cada prioridade de
 * canal, as memórias relevantes. Aqui só se monta o texto: as partes de cada consumidor na ordem que
 * importa, segredos removidos **antes** do corte e o limite do contrato (2.000 caracteres depois de
 * juntar os espaços). Vazio = sem foco. O texto nunca vai para log, cache nem evento.
 */

export const MEMORY_FOCUS_MAX = 2000

const SECRET_OMITTED = "[segredo]"

/** Padrões de credenciais comuns (tokens do Engramind e do Opex, Bearer, chaves de provedores, `KEY=valor`). */
const SECRET_PATTERNS: RegExp[] = [
    /\beng\.tk_[A-Za-z0-9]+\.[A-Za-z0-9._-]+/g,
    /\bmt_sys_[A-Za-z0-9_-]{8,}/g,
    /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
    /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{12,}/g,
    /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
    /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
    /\bAKIA[0-9A-Z]{16}\b/g,
    /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g,
    /\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|PWD))\s*[=:]\s*("[^"]*"|'[^']*'|\S+)/g,
]

/** Remove segredos de um texto livre (o nome da variável de `KEY=valor` fica; o valor sai). */
export function redactFocusText(text: string): string {
    let out = text
    for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, (match, name: string | undefined) => (typeof name === "string" && /[=:]/.test(match) ? `${name}=${SECRET_OMITTED}` : SECRET_OMITTED))
    return out
}

const normalize = (text: string) => text.replace(/\s+/g, " ").trim()

/** Junta as partes (na ordem), remove segredos, normaliza os espaços e corta no limite; `undefined` = sem foco. */
export function composeFocus(parts: readonly (string | null | undefined)[], max = MEMORY_FOCUS_MAX): string | undefined {
    const joined = normalize(redactFocusText(parts.filter((part): part is string => typeof part === "string" && part.trim().length > 0).join("\n")))
    if (!joined) return undefined
    if (joined.length <= max) return joined
    return joined.slice(0, max).trimEnd()
}

export type MemoryFocusInput =
    /** Agente Opex/Maddox (dono ou portal) e Arquiteto: o pedido do turno. */
    | { kind: "message"; text: string | null | undefined }
    /** Agente desenvolvedor: título e etapa/mesa primeiro, descrição no restante. */
    | { kind: "task"; code?: string | null; title?: string | null; stage?: string | null; workbench?: string | null; description?: string | null }
    /** Agente Adversário: tarefa, veredito e diff (nessa ordem). */
    | { kind: "review"; task?: string | null; verdict?: string | null; diff?: string | null }

/** Foco de um turno de um consumidor (o consumidor só documenta a origem; a forma vem do `kind`). */
export function buildMemoryFocus(_consumer: MemoryConsumer, input: MemoryFocusInput): string | undefined {
    switch (input.kind) {
        case "message":
            return composeFocus([input.text])
        case "task": {
            const head = [input.code, input.title].filter(Boolean).join(" ")
            const where = [input.stage ? `Etapa: ${input.stage}` : null, input.workbench ? `Mesa: ${input.workbench}` : null].filter(Boolean).join(" · ")
            return composeFocus([head, where, input.description])
        }
        case "review":
            return composeFocus([input.task, input.verdict, input.diff])
    }
}
