import { z, type ZodType } from "zod"
import type { Category, ChannelSettingMeta, SettingMeta } from "../types"

/**
 * Validação das configurações gerada do metadado de `GET /v1/settings` (tipo, intervalo, opções):
 * o mesmo schema roda no formulário e no servidor antes do `PUT`. `null` volta ao padrão.
 */

export const categorySchema = z.object({
    key: z
        .string()
        .trim()
        .min(1, "Informe a chave")
        .max(40, "Até 40 caracteres")
        .regex(/^[A-Z][A-Z0-9_]*$/, "Maiúsculas, dígitos e _, começando por letra"),
    label: z.string().trim().min(1, "Informe o rótulo").max(80),
    priority: z.number().int("Prioridade inteira").min(-1000).max(1000),
})

type Meta = Pick<SettingMeta, "key" | "type" | "min" | "max" | "choices"> | Pick<ChannelSettingMeta, "key" | "type" | "min" | "max">

const range = (schema: z.ZodNumber, meta: Meta) => {
    let next = schema
    if (typeof meta.min === "number") next = next.min(meta.min, `Mínimo ${meta.min}`)
    if (typeof meta.max === "number") next = next.max(meta.max, `Máximo ${meta.max}`)
    return next
}

/** Schema do valor de uma chave (sem o `null`). */
export function settingValueSchema(meta: Meta): ZodType<unknown> {
    switch (meta.type) {
        case "integer":
            return range(z.number({ error: "Informe um número" }).int("Use um número inteiro"), meta)
        case "number":
            return range(z.number({ error: "Informe um número" }), meta)
        case "boolean":
            return z.boolean()
        case "enum": {
            const choices = "choices" in meta && meta.choices?.length ? meta.choices : null
            return choices ? z.enum(choices as [string, ...string[]], { error: `Use ${choices.join(", ")}` }) : z.string().min(1)
        }
        case "url":
            return z.string().trim().max(2048).regex(/^https?:\/\/[^\s/]+/, "Use uma URL http:// ou https://")
        case "list": {
            const max = typeof meta.max === "number" ? meta.max : 5
            return z.array(z.string().trim().min(1).max(200)).max(max, `Até ${max} itens`)
        }
        case "categories": {
            const min = typeof meta.min === "number" ? meta.min : 1
            const max = typeof meta.max === "number" ? meta.max : 50
            return z
                .array(categorySchema)
                .min(min, `Ao menos ${min} categoria(s)`)
                .max(max, `Até ${max} categorias`)
                .refine((items) => new Set(items.map((item) => item.key)).size === items.length, "Chaves de categoria repetidas")
        }
        case "secret":
            return z.never({ error: "Segredo: grave pela aba Provedores" })
        default: {
            const min = typeof meta.min === "number" ? meta.min : 1
            const max = typeof meta.max === "number" ? meta.max : 4000
            return z.string().trim().min(min, `Ao menos ${min} caractere(s)`).max(max, `Até ${max} caracteres`)
        }
    }
}

/** Schema do mapa parcial (`chave → valor | null`) aceito pelo `PUT`. Chave fora do metadado é recusada. */
export function buildSettingsSchema(metas: readonly Meta[]): ZodType<Record<string, unknown>> {
    const byKey = new Map(metas.map((meta) => [meta.key, meta]))
    return z.record(z.string(), z.unknown()).superRefine((value, ctx) => {
        for (const [key, raw] of Object.entries(value)) {
            const meta = byKey.get(key)
            if (!meta) {
                ctx.addIssue({ code: "custom", path: [key], message: `Configuração desconhecida: ${key}` })
                continue
            }
            if (raw === null) continue
            const parsed = settingValueSchema(meta).safeParse(raw)
            if (!parsed.success) ctx.addIssue({ code: "custom", path: [key], message: parsed.error.issues[0]?.message ?? "Valor inválido" })
        }
    })
}

/** Só as chaves que mudaram em relação ao valor salvo (comparação estrutural). */
export function changedSettings(saved: Record<string, unknown>, draft: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(draft)) if (JSON.stringify(saved[key] ?? null) !== JSON.stringify(value ?? null)) out[key] = value
    return out
}

/** Grupo da chave (`embedding.model` → `embedding`). */
export const settingGroupOf = (key: string) => key.split(".")[0] ?? key

export const isCategoryList = (value: unknown): value is Category[] => Array.isArray(value) && value.every((item) => categorySchema.safeParse(item).success)
