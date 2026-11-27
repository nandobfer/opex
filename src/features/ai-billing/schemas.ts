import { z } from "zod"

/**
 * Plano de cobrança de uma chave de API de IA (OPE-203) — módulo PURO, o mesmo schema na API e no formulário.
 *
 * - Pago por uso: o custo efetivo é o custo de tabela.
 * - Assinatura: mensalidade (USD ou BRL), dia de renovação e IOF/spread opcional; chaves da mesma conta (detectadas
 *   pela API de cota) contam a mensalidade uma vez.
 * - Créditos: valor de face (US$), quanto foi pago (0 = concedidos), início, validade e "esgotado em" opcional.
 */

export const AI_BILLING_MODES = ["usage", "subscription", "credits"] as const
export type AiBillingMode = (typeof AI_BILLING_MODES)[number]

export const AI_BILLING_MODE_LABELS: Record<AiBillingMode, string> = {
    usage: "Pago por uso",
    subscription: "Assinatura",
    credits: "Créditos",
}

export const AI_BILLING_CURRENCIES = ["USD", "BRL"] as const
export type AiBillingCurrency = (typeof AI_BILLING_CURRENCIES)[number]

const money = (label: string) =>
    z.number({ error: `Informe ${label}` }).finite(`Informe ${label}`).min(0, `${label[0]!.toUpperCase()}${label.slice(1)} não pode ser negativo`).max(1_000_000, "Valor alto demais")

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use uma data válida")
const optionalDate = dateKey.nullable()

export const usageBillingSchema = z.object({ mode: z.literal("usage") })

export const subscriptionBillingSchema = z.object({
    mode: z.literal("subscription"),
    amount: money("o valor da mensalidade").refine((value) => value > 0, "A mensalidade precisa ser maior que zero"),
    currency: z.enum(AI_BILLING_CURRENCIES, { error: "Escolha a moeda" }),
    renewalDay: z.number({ error: "Informe o dia de renovação" }).int("Use um dia inteiro").min(1, "Use um dia de 1 a 31").max(31, "Use um dia de 1 a 31"),
    iofPercent: z.number().finite().min(0, "O IOF/spread não pode ser negativo").max(100, "Use no máximo 100%").nullable(),
})

export const creditsBillingSchema = z
    .object({
        mode: z.literal("credits"),
        faceValueUsd: money("o valor de face").refine((value) => value > 0, "O valor de face precisa ser maior que zero"),
        paidAmount: money("o valor pago"),
        paidCurrency: z.enum(AI_BILLING_CURRENCIES, { error: "Escolha a moeda" }),
        startsAt: optionalDate,
        expiresAt: optionalDate,
        exhaustedAt: optionalDate,
    })
    .refine((value) => !value.startsAt || !value.expiresAt || value.expiresAt >= value.startsAt, { message: "A validade precisa ser depois do início", path: ["expiresAt"] })

export const aiKeyBillingSchema = z.discriminatedUnion("mode", [usageBillingSchema, subscriptionBillingSchema, creditsBillingSchema])
export type AiKeyBilling = z.infer<typeof aiKeyBillingSchema>
export type SubscriptionBilling = z.infer<typeof subscriptionBillingSchema>
export type CreditsBilling = z.infer<typeof creditsBillingSchema>

/** Gravado na chave: o plano e quando foi definido (início padrão dos créditos). */
export type StoredAiKeyBilling = AiKeyBilling & { setAt?: string }

export const USAGE_BILLING: AiKeyBilling = { mode: "usage" }

/** Plano salvo (ou ausente/inválido) → plano válido; sem plano vale "Pago por uso". */
export function billingOf(raw: unknown): StoredAiKeyBilling {
    const parsed = aiKeyBillingSchema.safeParse(raw)
    if (!parsed.success) return USAGE_BILLING
    const setAt = (raw as { setAt?: unknown }).setAt
    return typeof setAt === "string" ? { ...parsed.data, setAt } : parsed.data
}

const formatAmount = (amount: number, currency: AiBillingCurrency) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)

const formatDay = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`

/** Resumo de uma linha do plano (item da chave). */
export function billingSummary(billing: AiKeyBilling): string {
    switch (billing.mode) {
        case "usage":
            return "Pago por uso"
        case "subscription":
            return `Assinatura de ${formatAmount(billing.amount, billing.currency)}/mês · renova dia ${billing.renewalDay}${billing.iofPercent ? ` · IOF/spread ${billing.iofPercent.toLocaleString("pt-BR")}%` : ""}`
        case "credits":
            return `Créditos de ${formatAmount(billing.faceValueUsd, "USD")} · ${billing.paidAmount === 0 ? "concedidos" : `pagos ${formatAmount(billing.paidAmount, billing.paidCurrency)}`}${billing.expiresAt ? ` · válidos até ${formatDay(billing.expiresAt)}` : ""}`
    }
}

/** Evento Pusher (`private-app`) quando dados de custo mudam fora das chaves: PTAX ou uso diário das assinaturas. */
export const AI_BILLING_UPDATED_EVENT = "ai-billing-updated"
export type AiBillingUpdatedPayload = { kind: "fx" | "subscription-days" }
