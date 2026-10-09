import { Schema, model, models, type Model } from "mongoose"

/**
 * Última leitura do quadro do Go! Sipal feita pela rotina de sincronização: assinatura por
 * tarefa (`id → status|ordem|atualização|responsável|arquivada`). Um único documento
 * (`key: "board"`); a rotina compara a leitura nova com esta para descobrir o que mudou.
 */
export interface IGoSipalTaskSnapshot {
    key: string
    signatures: Record<string, string>
    syncedAt: Date
}

const GoSipalTaskSnapshotSchema = new Schema<IGoSipalTaskSnapshot>(
    {
        key: { type: String, required: true, unique: true },
        signatures: { type: Schema.Types.Mixed, default: {} },
        syncedAt: { type: Date, required: true },
    },
    { collection: "go_sipal_task_snapshots", versionKey: false, minimize: false },
)

if (process.env.NODE_ENV === "development") {
    delete models.GoSipalTaskSnapshot
}

export const GoSipalTaskSnapshot: Model<IGoSipalTaskSnapshot> =
    (models.GoSipalTaskSnapshot as Model<IGoSipalTaskSnapshot>) || model<IGoSipalTaskSnapshot>("GoSipalTaskSnapshot", GoSipalTaskSnapshotSchema)
