import { z } from "zod"
import { extractJsonBlock } from "@/features/agentic/prompts"
import { MENTOR_LEVEL_DEFS, type MentorLevel } from "./constants"

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

const writerSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("create"), text: z.string().trim().min(3), reason: z.string().trim().max(2000).optional().default("") }),
    z.object({ action: z.literal("update"), memoryId: z.string().trim().min(1), text: z.string().trim().min(3), reason: z.string().trim().max(2000).optional().default("") }),
    z.object({ action: z.literal("skip"), reason: z.string().trim().max(2000).optional().default("") }),
])
export type WriterAnswer = z.infer<typeof writerSchema>

/** Resposta do redator: criar, atualizar (fundir com uma existente) ou não gravar. `null` = inválida. */
export function parseWriterAnswer(text: string): WriterAnswer | null {
    const parsed = writerSchema.safeParse(extractJsonBlock(text))
    return parsed.success ? parsed.data : null
}

/** `update` com id que não existe vira `create` (a memória pode ter sido excluída). */
export function resolveWriterAction(answer: Exclude<WriterAnswer, { action: "skip" }>, existingIds: readonly string[]): { action: "create" | "update"; memoryId: string | null; text: string } {
    if (answer.action === "update" && existingIds.includes(answer.memoryId)) return { action: "update", memoryId: answer.memoryId, text: answer.text }
    return { action: "create", memoryId: null, text: answer.text }
}
