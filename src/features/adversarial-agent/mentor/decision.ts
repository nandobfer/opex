import { z } from "zod"
import { extractJsonBlock } from "@/features/agentic/prompts"
import { MENTOR_LEVEL_DEFS, MENTOR_TARGETS, type MentorLevel, type MentorSkipKind, type MentorTarget } from "./constants"

/** Decisões do Agente Mentor (módulo puro): limiar do slider e leitura das respostas do decisor e do redator. */

export function mentorThreshold(level: MentorLevel): number {
    return MENTOR_LEVEL_DEFS[level].threshold
}

/** Nota no limiar (ou acima) segue para o redator. */
export function passesThreshold(score: number, level: MentorLevel): boolean {
    return score >= mentorThreshold(level)
}

const deciderSchema = z.object({
    score: z.coerce.number().min(0).max(1),
    reason: z.string().trim().max(2000).optional().default(""),
})
export type DeciderAnswer = z.infer<typeof deciderSchema>

/** Resposta do decisor por texto: `{ score, reason }` (nota de 0 a 1). `null` = resposta inválida. */
export function parseDeciderAnswer(text: string): DeciderAnswer | null {
    const parsed = deciderSchema.safeParse(extractJsonBlock(text))
    return parsed.success ? parsed.data : null
}

/**
 * JSON da resposta do redator: cerca ```json ou o objeto inteiro do primeiro `{` ao último `}`.
 * `extractJsonBlock` parte do ÚLTIMO `{` (bom para texto com JSON solto no fim), mas o redator responde
 * com objetos aninhados — aí o último `{` é o objeto interno e a resposta seria truncada.
 */
export function writerJson(text: string): unknown {
    const fenced = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)].map((match) => match[1]!.trim()).reverse()
    const first = text.indexOf("{")
    const last = text.lastIndexOf("}")
    const candidates = [...fenced, ...(first >= 0 && last > first ? [text.slice(first, last + 1)] : [])]
    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate)
        } catch {
            // tenta o próximo
        }
    }
    return extractJsonBlock(text)
}

/**
 * O `skip` só é aceito com motivo verificável (OPE-132): `kind` presente, e a cobertura citando uma
 * memória da PRÓPRIA lista de destino. Sem `kind`, o redator é chamado de novo para dizê-lo; `no_lesson`
 * não pode citar memória; cobertura em outra lista nunca descarta a lição. `null` = aceito; senão, o
 * motivo (pt-BR) para a nova tentativa.
 */
export function checkWriterSkip(answer: { kind?: MentorSkipKind | null; memoryId?: string | null; reason?: string | null }, destinationIds: readonly string[], otherIds: readonly string[] = []): string | null {
    if (!answer.kind) return 'Diga o motivo de não gravar: "kind": "covered" com o id de uma memória DESTA lista, ou "kind": "no_lesson" se não há lição.'
    const cited = answer.memoryId?.trim() || null
    const mentioned = answer.reason?.match(/\bm_[A-Za-z0-9]+\b/g) ?? []
    const ids = cited ? [cited] : mentioned
    if (answer.kind === "no_lesson") {
        if (ids.length) return 'Um skip sem lição não deve citar memória: use "kind": "covered" com o id de uma memória DESTA lista que já cobre a lição.'
        return null
    }
    if (ids.some((id) => destinationIds.includes(id))) return null
    const other = ids.find((id) => otherIds.includes(id))
    if (other) {
        return `A memória ${other} citada é de outra lista. Cobertura em outra lista não dispensa gravar a lição: generalize-a para a lista de destino (o digestor escreve um caso para cada lista; a parte da outra lista vai no caso dela).`
    }
    return 'Para não gravar por cobertura, cite em "memoryId" o id de uma memória DESTA lista que já cobre a lição. Cobertura em outra lista não é motivo para não gravar.'
}

const routerSchema = z.object({
    target: z.enum(MENTOR_TARGETS),
    confidence: z.coerce.number().min(0).max(1).nullable().optional().default(null),
    reason: z.string().trim().max(2000).optional().default(""),
})
export type RouterAnswer = z.infer<typeof routerSchema>

/** Resposta do Triador por texto: `{ target, confidence, reason }`. `null` = inválida ou destino desligado. */
export function parseRouterAnswer(text: string, enabled: readonly MentorTarget[]): RouterAnswer | null {
    const parsed = routerSchema.safeParse(extractJsonBlock(text))
    return parsed.success && enabled.includes(parsed.data.target) ? parsed.data : null
}

/** Escolha do JEV (`choice`) entre os destinos ligados. `null` = opção fora da lista. */
export function routerChoiceOf(choice: string, enabled: readonly MentorTarget[]): MentorTarget | null {
    return (enabled as readonly string[]).includes(choice) ? (choice as MentorTarget) : null
}

// ── Reorganização do acervo (OPE-132) ──────────────────────────────────────

const reorgRouterSchema = z.object({
    target: z.string().trim().min(1),
    confidence: z.coerce.number().min(0).max(1).nullable().optional().default(null),
    reason: z.string().trim().max(2000).optional().default(""),
})
export type ReorgRouterAnswer = z.infer<typeof reorgRouterSchema>

/** Resposta do Triador da reorganização; a chave do destino é conferida contra as opções pelo serviço. */
export function parseReorgRouterAnswer(text: string): ReorgRouterAnswer | null {
    const parsed = reorgRouterSchema.safeParse(extractJsonBlock(text))
    return parsed.success ? parsed.data : null
}

const reorgWriterSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("keep"), reason: z.string().trim().max(2000).optional().default("") }),
    z.object({ action: z.literal("rewrite"), text: z.string().trim().min(3), reason: z.string().trim().max(2000).optional().default("") }),
    z.object({ action: z.literal("merge"), memoryId: z.string().trim().min(1), text: z.string().trim().min(3), reason: z.string().trim().max(2000).optional().default("") }),
])
export type ReorgWriterAnswer = z.infer<typeof reorgWriterSchema>

/** Resposta do redator da reorganização: manter, reescrever ou fundir. `null` = inválida. */
export function parseReorgWriterAnswer(text: string): ReorgWriterAnswer | null {
    const parsed = reorgWriterSchema.safeParse(writerJson(text))
    return parsed.success ? parsed.data : null
}
