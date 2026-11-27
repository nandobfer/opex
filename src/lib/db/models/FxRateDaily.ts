import { Schema, model, models, type Model } from "mongoose"

/**
 * Cotação do dólar por dia (OPE-203): PTAX de venda do Banco Central. Um documento por dia corrido
 * (`date`, calendário de Brasília); fim de semana e feriado guardam a cotação do último dia útil anterior
 * (`quotedDate`). Dia sem cotação conhecida não tem documento (o valor em R$ fica "indisponível").
 */
export interface IFxRateDaily {
    date: string
    usdBrl: number
    quotedDate: string
    fetchedAt: Date
}

const FxRateDailySchema = new Schema<IFxRateDaily>(
    {
        date: { type: String, required: true, unique: true },
        usdBrl: { type: Number, required: true },
        quotedDate: { type: String, required: true },
        fetchedAt: { type: Date, default: () => new Date() },
    },
    { collection: "fx_rates_daily", versionKey: false },
)

if (process.env.NODE_ENV === "development") {
    delete models.FxRateDaily
}

export const FxRateDaily: Model<IFxRateDaily> = (models.FxRateDaily as Model<IFxRateDaily>) || model<IFxRateDaily>("FxRateDaily", FxRateDailySchema)
