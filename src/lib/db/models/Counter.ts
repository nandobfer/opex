import { Schema, model, models, type Model } from "mongoose"

/**
 * Contador sequencial genérico (`counters`). Usado quando uma sequência **não** pertence a um
 * projeto (ex.: o código `SRV-{n}` dos serviços sem repositório). Cada chave tem o próprio valor;
 * o incremento é atômico (`$inc`), então nunca repete um número.
 */

export interface ICounter {
    key: string
    seq: number
    createdAt: Date
    updatedAt: Date
}

const CounterSchema = new Schema<ICounter>(
    {
        key: { type: String, required: true, unique: true },
        seq: { type: Number, default: 0 },
    },
    { collection: "counters", versionKey: false, timestamps: true },
)

if (process.env.NODE_ENV === "development") {
    delete models.Counter
}

export const Counter: Model<ICounter> = (models.Counter as Model<ICounter>) || model<ICounter>("Counter", CounterSchema)
