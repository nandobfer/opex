import { z } from "zod"

/**
 * Texto das memórias dos agentes (módulo PURO: tela, rotas, ferramentas e migração). Os limites vêm do
 * Engramind (`memory.text_min` / `memory.text_max`, este com sobreposição por canal); os schemas
 * estáticos só seguram o teto absoluto do Engramind (20.000) e a regra fina fica em `memoryInputSchemaFor`.
 */

export interface MemoryTextLimits {
    textMin: number
    textMax: number
}

/** Padrões do Engramind (usados até a primeira leitura das configurações). */
export const DEFAULT_MEMORY_TEXT_LIMITS: MemoryTextLimits = { textMin: 3, textMax: 4000 }
/** Teto absoluto aceito pelo Engramind (`memory.text_max` vai até 20.000). */
export const MEMORY_TEXT_ABSOLUTE_MAX = 20_000

const formatCount = (value: number) => value.toLocaleString("pt-BR")

export function memoryTextSchema(limits: MemoryTextLimits = DEFAULT_MEMORY_TEXT_LIMITS) {
    return z
        .string()
        .trim()
        .min(limits.textMin, limits.textMin <= 1 ? "Escreva a memória" : `Escreva a memória (mínimo de ${formatCount(limits.textMin)} caracteres)`)
        .max(limits.textMax, `Até ${formatCount(limits.textMax)} caracteres`)
}

/** Formulário de memória (tela): texto com os limites do Engramind + categoria. */
export function memoryInputSchemaFor(limits: MemoryTextLimits = DEFAULT_MEMORY_TEXT_LIMITS) {
    return z.object({ texto: memoryTextSchema(limits), categoria: z.string().trim().min(1, "Escolha a categoria").max(40) })
}
export type MemoryFormInput = z.infer<ReturnType<typeof memoryInputSchemaFor>>

const categoria = z.string().trim().min(1).max(40)

/** Corpo de `POST .../memories` (mesmo contrato na tela e na API; os limites finos são do servidor). */
export const memoryCreateSchema = z.object({
    texto: z.string().trim().min(1, "Escreva a memória").max(MEMORY_TEXT_ABSOLUTE_MAX),
    categoria: categoria.nullish(),
    fixada: z.boolean().optional(),
})
export type MemoryCreateInput = z.infer<typeof memoryCreateSchema>

/** Corpo de `PATCH .../memories/[id]`: texto/categoria (com a versão lida), fixar e ativar. */
export const memoryPatchSchema = z
    .object({
        texto: z.string().trim().min(1, "Escreva a memória").max(MEMORY_TEXT_ABSOLUTE_MAX).optional(),
        categoria: categoria.optional(),
        versao: z.number().int().positive().optional(),
        fixada: z.boolean().optional(),
        ativa: z.boolean().optional(),
    })
    .refine((value) => value.texto !== undefined || value.categoria !== undefined || value.fixada !== undefined || value.ativa !== undefined, { message: "Informe o que mudar na memória" })
export type MemoryPatchInput = z.infer<typeof memoryPatchSchema>

/** Normaliza espaços sem perder as quebras de parágrafo. */
export function normalizeText(text: string): string {
    return text
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((line) => line.replace(/[ \t]+/g, " ").trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
}

/** Corta em limite de palavra, com reticências (ex.: nunca "integraç…"). */
export function truncateAtWord(text: string, maxLength: number): string {
    const collapsed = text.replace(/\s+/g, " ").trim()
    if (collapsed.length <= maxLength) return collapsed
    const slice = collapsed.slice(0, maxLength - 1)
    const lastSpace = slice.lastIndexOf(" ")
    return `${(lastSpace > maxLength / 2 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`
}

/** Resumo de reserva enquanto o Redator não respondeu: a primeira frase do texto, cortada em palavra. */
export function firstSentence(text: string, maxLength = 120): string {
    const first = normalizeText(text).split(/(?<=[.!?])\s|\n/)[0] ?? text
    return truncateAtWord(first.replace(/[.!?;:,]+$/, ""), maxLength)
}

/** Estimativa de tokens (≈ 4 caracteres por token), só para avisos de orçamento. */
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
}

/** Teto usado onde o limite do Engramind ainda não foi lido (Agente Mentor): o padrão de `memory.text_max`. */
export const MEMORY_TEXT_MAX = DEFAULT_MEMORY_TEXT_LIMITS.textMax
