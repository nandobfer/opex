import { z } from "zod"
import { AI_SOURCE_SECTIONS, EMBEDDING_SOURCE_PROVIDERS, MAX_FALLBACK_MODELS, REDATOR_SOURCE_PROVIDERS } from "../ai-source"

/**
 * Schemas da "IA do Opex" (Redator e embedding), os mesmos no formulário, na rota e no Agente Opex.
 * Nenhum aceita URL: o provedor escolhido define o endereço (`.strict()` recusa campos a mais).
 */

const modelId = z.string().trim().min(1, "Escolha o modelo").max(200, "Até 200 caracteres")

export const redatorSourceSchema = z
    .object({
        provider: z.enum(REDATOR_SOURCE_PROVIDERS, { error: "Escolha o provedor" }),
        model: modelId,
        fallbackModels: z.array(modelId).max(MAX_FALLBACK_MODELS, `Até ${MAX_FALLBACK_MODELS} modelos de reserva`).default([]),
    })
    .strict()
    .superRefine((value, ctx) => {
        if (new Set(value.fallbackModels).size !== value.fallbackModels.length) ctx.addIssue({ code: "custom", path: ["fallbackModels"], message: "Modelo de reserva repetido" })
        if (value.fallbackModels.includes(value.model)) ctx.addIssue({ code: "custom", path: ["fallbackModels"], message: "O modelo principal não entra nas reservas" })
    })

export const embeddingSourceSchema = z
    .object({
        provider: z.enum(EMBEDDING_SOURCE_PROVIDERS, { error: "Escolha o provedor" }),
        model: modelId.nullable().default(null),
        dimensions: z.number().int("Número inteiro").min(1, "Mínimo 1").max(8192, "Máximo 8192").nullable().default(null),
    })
    .strict()
    .superRefine((value, ctx) => {
        if (value.provider !== "off" && !value.model) ctx.addIssue({ code: "custom", path: ["model"], message: "Escolha o modelo" })
    })

export type RedatorSourceInput = z.input<typeof redatorSourceSchema>
export type EmbeddingSourceInput = z.input<typeof embeddingSourceSchema>

export const applyAiSourceSchema = z.discriminatedUnion("section", [
    z.object({ section: z.literal("redator"), source: redatorSourceSchema }).strict(),
    z.object({ section: z.literal("embedding"), source: embeddingSourceSchema }).strict(),
])
export type ApplyAiSourceInput = z.infer<typeof applyAiSourceSchema>

export const testAiSourceSchema = z.discriminatedUnion("section", [
    z.object({ section: z.literal("redator"), source: redatorSourceSchema, text: z.string().trim().min(1).max(4000).optional() }).strict(),
    z.object({ section: z.literal("embedding"), source: embeddingSourceSchema, text: z.string().trim().min(1).max(4000).optional() }).strict(),
])
export type TestAiSourceInput = z.infer<typeof testAiSourceSchema>

export const resendAiKeySchema = z.object({ section: z.enum(AI_SOURCE_SECTIONS) }).strict()
