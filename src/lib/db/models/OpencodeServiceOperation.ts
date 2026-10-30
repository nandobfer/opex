import { Schema, model, models, type Model, type Types } from "mongoose"

/**
 * `opencode_service_operations`: ações no ciclo de vida do serviço do OpenCode (iniciar, parar,
 * reiniciar, atualizar) feitas por SSH pela aba Controles ou pelo Agente Opex. Uma por vez; a que
 * ficou `running` quando o Opex reiniciou vira `interrupted` na próxima leitura.
 */
export interface IOpencodeServiceOperation {
    _id: Types.ObjectId
    action: "start" | "stop" | "restart" | "upgrade"
    status: "running" | "succeeded" | "failed" | "interrupted"
    fromVersion: string | null
    toVersion: string | null
    /** Fim da saída do comando (sem cores). */
    output: string
    error: string | null
    origin: "ui" | "opex-agent"
    /** Sessão do Agente Opex que pediu (aviso ao terminar). */
    opexSessionId: string | null
    createdBy: string
    startedAt: Date
    finishedAt: Date | null
}

const OpencodeServiceOperationSchema = new Schema<IOpencodeServiceOperation>(
    {
        action: { type: String, required: true },
        status: { type: String, required: true, index: true },
        fromVersion: { type: String, default: null },
        toVersion: { type: String, default: null },
        output: { type: String, default: "" },
        error: { type: String, default: null },
        origin: { type: String, required: true },
        opexSessionId: { type: String, default: null },
        createdBy: { type: String, required: true },
        startedAt: { type: Date, required: true, index: true },
        finishedAt: { type: Date, default: null },
    },
    { collection: "opencode_service_operations", versionKey: false },
)

if (process.env.NODE_ENV === "development") {
    delete models.OpencodeServiceOperation
}

export const OpencodeServiceOperation: Model<IOpencodeServiceOperation> =
    (models.OpencodeServiceOperation as Model<IOpencodeServiceOperation>) || model<IOpencodeServiceOperation>("OpencodeServiceOperation", OpencodeServiceOperationSchema)
