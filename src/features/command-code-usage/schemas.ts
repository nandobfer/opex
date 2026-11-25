import { z } from "zod"

/**
 * Respostas da API da CLI do Command Code (`/alpha/*`, interna e não documentada, OPE-190): só os campos usados.
 * O `z.object` descarta o resto — nome, e-mail, `quantity`, `pendingPhase`, `cancelAtPeriodEnd`, `orgId` da
 * assinatura etc. nunca chegam ao DTO, ao log nem ao evento. Respostas embrulhadas em `{ data: … }` são aceitas.
 */

/** Desembrulha `{ data: {...} }` quando a resposta vem nesse formato. */
const unwrap = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) && "data" in value && value.data && typeof value.data === "object" ? value.data : value)

/** Instante em ISO ou epoch (ms; abaixo de 1e12, segundos); 0, vazio ou inválido → `null`. */
export function toIsoInstant(value: unknown): string | null {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return new Date(value < 1e12 ? value * 1000 : value).toISOString()
    if (typeof value === "string" && value.trim()) {
        if (/^\d+$/.test(value.trim())) return toIsoInstant(Number(value.trim()))
        const ms = Date.parse(value)
        return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null
    }
    return null
}

const instant = z.unknown().transform(toIsoInstant)
const amount = z.number().finite()

export const ccWhoamiSchema = z.preprocess(
    unwrap,
    z.object({
        user: z.object({ id: z.union([z.string(), z.number()]).transform(String) }).nullish(),
        org: z.object({ id: z.union([z.string(), z.number()]).transform(String) }).nullish(),
    }),
)
export type CcWhoami = z.infer<typeof ccWhoamiSchema>

const windowSchema = z.object({ used: amount, cap: amount, resetAt: instant.optional() })
export type CcWindow = { used: number; cap: number; resetAt: string | null }

export const ccCreditsSchema = z.preprocess(
    unwrap,
    z.object({
        credits: z.object({
            monthlyCredits: amount,
            purchasedCredits: amount.nullish(),
            freeCredits: amount.nullish(),
        }),
        windowLimits: z
            .object({
                limited: z.boolean().nullish(),
                fiveHour: windowSchema.nullish(),
                weekly: windowSchema.nullish(),
            })
            .nullish(),
    }),
)
export type CcCredits = z.infer<typeof ccCreditsSchema>

export const ccSubscriptionSchema = z.preprocess(
    unwrap,
    z.object({
        planId: z.string().nullish(),
        status: z.string().nullish(),
        currentPeriodStart: instant,
        currentPeriodEnd: instant,
    }),
)
export type CcSubscription = z.infer<typeof ccSubscriptionSchema>

export const ccSummarySchema = z.preprocess(
    unwrap,
    z.object({
        totalCost: amount,
        totalCount: amount.nullish(),
        totalMonthlyCredits: amount.nullish(),
    }),
)
export type CcSummary = z.infer<typeof ccSummarySchema>

/** Caminhos dos campos que falharam na validação (só nomes, nunca valores). */
export function failedFields(error: z.ZodError): string[] {
    return [...new Set(error.issues.map((issue) => issue.path.join(".") || "(raiz)"))].slice(0, 5)
}
