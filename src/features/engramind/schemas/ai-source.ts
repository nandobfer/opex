import { z } from "zod"
import { AI_SOURCE_SECTIONS, EMBEDDING_SOURCE_PROVIDERS, MAX_FALLBACK_MODELS, REDATOR_SOURCE_PROVIDERS } from "../ai-source"

/**
 * Schemas da "IA do Opex" (Redator e embedding), os mesmos no formulário, na rota e no Agente Opex.
 * Nenhum aceita URL: o provedor escolhido define o endereço (`.strict()` recusa campos a mais).
 */

/** Temperatura do Redator (Engramind 0.10.0): 0 a 2; vazio (`null`) omite o campo e usa o padrão do modelo. */
export const temperatureSchema = z.number({ error: "Informe um número" }).min(0, "Mínimo 0").max(2, "Máximo 2").nullable().default(null)

const modelId = z.string().trim().min(1, "Escolha o modelo").max(200, "Até 200 caracteres")

export const redatorSourceSchema = z
    .object({
        provider: z.enum(REDATOR_SOURCE_PROVIDERS, { error: "Escolha o provedor" }),
        model: modelId,
        fallbackModels: z.array(modelId).max(MAX_FALLBACK_MODELS, `Até ${MAX_FALLBACK_MODELS} modelos de reserva`).default([]),
        temperature: temperatureSchema,
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

const definedOnly = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))

/**
 * Entrada da ferramenta do agente: um OBJETO no topo (o JSON Schema das ferramentas exige `type:
 * object`; a união discriminada viraria `oneOf` e o provedor de IA/MCP veria uma entrada vazia),
 * validado e convertido pelo `applyAiSourceSchema`.
 */
export const applyAiSourceToolSchema = z
    .object({
        section: z.enum(AI_SOURCE_SECTIONS).describe("redator ou embedding"),
        source: z
            .object({
                provider: z.enum([...new Set([...REDATOR_SOURCE_PROVIDERS, ...EMBEDDING_SOURCE_PROVIDERS])] as [string, ...string[]]).describe("Redator: gemini, anthropic, openai ou deepseek. Embedding: local, gemini, openai ou off"),
                model: z.string().nullable().optional().describe("Id do modelo (embedding off: sem modelo)"),
                fallbackModels: z.array(z.string()).optional().describe(`Só no Redator: até ${MAX_FALLBACK_MODELS} modelos de reserva`),
                dimensions: z.number().int().nullable().optional().describe("Só no embedding remoto: dimensão (vazia = a do modelo)"),
                temperature: z.number().nullable().optional().describe("Só no Redator: temperatura de 0 a 2; null/ausente = padrão do modelo (obrigatório nos modelos que recusam temperature, como a família 5.5 da Anthropic)"),
            })
            .strict(),
    })
    .strict()
    .meta({ examples: [{ section: "redator", source: { provider: "openai", model: "gpt-4o-mini", fallbackModels: [] } }] })
    .transform((value, ctx) => {
        const parsed = applyAiSourceSchema.safeParse({ section: value.section, source: definedOnly(value.source) })
        if (!parsed.success) {
            for (const issue of parsed.error.issues) ctx.addIssue({ code: "custom", path: issue.path.map((part) => (typeof part === "symbol" ? String(part) : part)), message: issue.message })
            return z.NEVER
        }
        return parsed.data
    })

export const resendAiKeySchema = z.object({ section: z.enum(AI_SOURCE_SECTIONS) }).strict()
