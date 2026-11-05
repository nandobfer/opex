import { z } from "zod"
import { extractJsonObject } from "./provision-plan"
import { routineNameKey } from "./slug"

/**
 * Identidade gerada pelo subagente de provisionamento (OPE-130, decisão D8, módulo PURO): quando o
 * dono deixa o **nome** e/ou o **objetivo** vazios, o subagente os gera a partir do que foi preenchido.
 *
 * O nome segue o padrão dos agentes de Integrações › Inteligência Artificial: só o **papel** (como o
 * `navLabel` "Desenvolvedor", "Arquiteto", "Adversário"), sem a palavra "Agente" — as telas mostram
 * "Agente <nome>" (`routineAgentTitle`). Validação restritiva: resposta fora do formato é recusada com o
 * motivo (o provisionamento tenta uma vez de novo e depois fica "com erro").
 */

export const MAX_GENERATED_NAME_LENGTH = 30
const NAME_WORD = /^\p{Lu}[\p{Ll}\p{M}]+$/u
const FORBIDDEN_NAMES = new Set(["rotineiro", "rotineiros", "agente", "agentes"])

export interface IdentityNeeds {
    name: boolean
    objective: boolean
}

export interface IdentityContext {
    name: string
    objective: string
    instructions: string
    /** Nomes que o gerado não pode repetir (agentes fixos e os outros rotineiros). */
    takenNames: readonly string[]
}

export interface GeneratedIdentity {
    name?: string
    objective?: string
}

const answerSchema = z.object({ name: z.string().optional(), objective: z.string().optional() })

/** O que falta gerar (só os campos vazios; o que o dono preencheu nunca é trocado). */
export const identityNeeds = (agent: { name: string; objective: string }): IdentityNeeds => ({ name: !agent.name.trim(), objective: !agent.objective.trim() })

/** Motivo da recusa do nome gerado, ou `null` quando ele vale. */
export function generatedNameProblem(name: string, takenNames: readonly string[]): string | null {
    const value = name.trim()
    if (!value) return "nome vazio"
    if (value.length > MAX_GENERATED_NAME_LENGTH) return `nome com mais de ${MAX_GENERATED_NAME_LENGTH} caracteres`
    const words = value.split(/\s+/)
    if (words.length > 2) return "use uma ou duas palavras"
    if (words.some((word) => !NAME_WORD.test(word))) return "use só letras, com a inicial maiúscula (ex.: \"Recrutador\")"
    const key = routineNameKey(value)
    if (key.split(" ").some((word) => FORBIDDEN_NAMES.has(word))) return "não use \"Agente\" nem \"Rotineiro\" no nome (as telas já mostram \"Agente <nome>\")"
    if (takenNames.some((taken) => routineNameKey(taken) === key)) return `"${value}" já é o nome de outro agente`
    return null
}

export function generatedObjectiveProblem(objective: string): string | null {
    const value = objective.trim()
    if (!value) return "objetivo vazio"
    if (value.length > 4_000) return "objetivo com mais de 4.000 caracteres"
    return null
}

/** Valida a resposta do subagente: devolve só os campos pedidos, ou lança com os motivos. */
export function parseGeneratedIdentity(text: string, needs: IdentityNeeds, takenNames: readonly string[]): GeneratedIdentity {
    const raw = extractJsonObject(text)
    const parsed = answerSchema.safeParse(raw ?? {})
    if (!raw || !parsed.success) throw new Error("o subagente não devolveu um JSON válido")
    const problems: string[] = []
    const result: GeneratedIdentity = {}
    if (needs.name) {
        const name = (parsed.data.name ?? "").trim().replace(/\s+/g, " ")
        const problem = generatedNameProblem(name, takenNames)
        if (problem) problems.push(`nome: ${problem}`)
        else result.name = name
    }
    if (needs.objective) {
        const objective = (parsed.data.objective ?? "").trim()
        const problem = generatedObjectiveProblem(objective)
        if (problem) problems.push(`objetivo: ${problem}`)
        else result.objective = objective
    }
    if (problems.length) throw new Error(problems.join("; "))
    return result
}

export const IDENTITY_INSTRUCTIONS = [
    "Você é o subagente de provisionamento dos agentes rotineiros do Opex.",
    "Gere a identidade que falta do agente a partir do que o dono escreveu (nome, objetivo, instruções).",
    "NOME: só o papel do agente, como os agentes do Opex (Desenvolvedor, Arquiteto, Adversário, Orçamentista, Catalogador, Refinador, Revisor, Mentor).",
    `Um substantivo de papel em pt-BR, uma ou duas palavras, inicial maiúscula, só letras, até ${MAX_GENERATED_NAME_LENGTH} caracteres (ex.: "Recrutador", "Monitor Fiscal").`,
    'Nunca use "Agente" nem "Rotineiro" no nome e não repita um nome já usado.',
    "OBJETIVO: de 1 a 3 frases em pt-BR dizendo o que o agente faz e quando o trabalho termina.",
    'Responda SOMENTE um JSON com os campos pedidos: {"name":"Papel","objective":"..."}',
].join("\n")

export function identityPrompt(context: IdentityContext, needs: IdentityNeeds, previousProblem?: string): string {
    const ask = [needs.name ? "name" : null, needs.objective ? "objective" : null].filter(Boolean).join(" e ")
    return [
        `Campos a gerar: ${ask}.`,
        context.name.trim() ? `Nome (definido pelo dono): ${context.name.trim()}` : "",
        context.objective.trim() ? `Objetivo (definido pelo dono): ${context.objective.trim()}` : "",
        context.instructions.trim() ? `Instruções:\n${context.instructions.trim().slice(0, 6000)}` : "",
        context.takenNames.length ? `Nomes já usados (não repita): ${context.takenNames.join(", ")}` : "",
        previousProblem ? `\nA resposta anterior foi recusada: ${previousProblem}. Corrija.` : "",
    ]
        .filter((line) => line !== "")
        .join("\n")
}

/** Título exibido ("Agente <nome>"); um nome que já começa com "Agente" fica como está. */
export function routineAgentTitle(name: string | null | undefined): string {
    const value = (name ?? "").trim()
    if (!value) return "Agente rotineiro (gerando nome…)"
    return /^agente\b/i.test(value) ? value : `Agente ${value}`
}
