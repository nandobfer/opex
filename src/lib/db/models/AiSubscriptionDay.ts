import { Schema, model, models, type Model } from "mongoose"

/**
 * Uso total de uma assinatura de IA num dia UTC (OPE-203), lido das APIs de cota (OpenCode Go: custo do dia no
 * Console, em US$; Command Code: créditos do pool usados no dia). É a base do rateio da mensalidade: a API só guarda
 * um histórico curto, então a rotina `ai-subscription-days` grava cada dia. `account` identifica a assinatura
 * (chaves da mesma conta compartilham o documento, `keyIds`).
 */
export interface IAiSubscriptionDay {
    provider: string
    account: string
    keyIds: string[]
    date: string
    total: number
    unit: "usd" | "credits"
    partial: boolean
    fetchedAt: Date
}

const AiSubscriptionDaySchema = new Schema<IAiSubscriptionDay>(
    {
        provider: { type: String, required: true },
        account: { type: String, required: true },
        keyIds: { type: [String], default: [] },
        date: { type: String, required: true },
        total: { type: Number, required: true },
        unit: { type: String, enum: ["usd", "credits"], required: true },
        partial: { type: Boolean, default: false },
        fetchedAt: { type: Date, default: () => new Date() },
    },
    { collection: "ai_subscription_days", versionKey: false },
)

AiSubscriptionDaySchema.index({ provider: 1, account: 1, date: 1 }, { unique: true })
AiSubscriptionDaySchema.index({ keyIds: 1, date: 1 })

if (process.env.NODE_ENV === "development") {
    delete models.AiSubscriptionDay
}

export const AiSubscriptionDay: Model<IAiSubscriptionDay> =
    (models.AiSubscriptionDay as Model<IAiSubscriptionDay>) || model<IAiSubscriptionDay>("AiSubscriptionDay", AiSubscriptionDaySchema)
