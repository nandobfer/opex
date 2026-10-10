import { Schema, model, models, type Model, type Types } from "mongoose"

/**
 * Refinamento de tarefa (Integrações › Provedores de IA › Refinar tarefa):
 * - `task_refinements`: um refinamento por tarefa (sessão longa do OpenCode, estado, perguntas
 *   pendentes e a última especificação salva);
 * - a saída da IA é gravada na mesma coleção de eventos das sessões longas (`agentic_events`),
 *   chaveada pelo id do refinamento.
 */

export interface ITaskRefinement {
    _id: Types.ObjectId
    taskId: string
    taskCode: string
    taskTitle: string
    projectId: string
    centralId: string
    sessionId: string | null
    sessionDirectory: string | null
    /** `idle`: parado esperando ação; `running`: turno do agente em andamento. */
    runState: string
    /** O agente julgou a especificação totalmente esclarecida. */
    resolved: boolean
    error: string | null
    /** Texto acumulado do turno atual (de onde a especificação é extraída). */
    lastText: string
    /** Última especificação técnica gravada na tarefa. */
    spec: string | null
    lastPrompt: { text: string } | null
    pendingForms: unknown[]
    pendingPermissions: unknown[]
    usage: { costUsd: number; inputTokens: number; outputTokens: number; reasoningTokens: number }
    heartbeatAt: Date | null
    startedAt: Date
    updatedAt: Date
    createdAt: Date
}

const TaskRefinementSchema = new Schema<ITaskRefinement>(
    {
        taskId: { type: String, required: true, unique: true },
        taskCode: { type: String, required: true },
        taskTitle: { type: String, required: true },
        projectId: { type: String, required: true },
        centralId: { type: String, required: true, index: true },
        sessionId: { type: String, default: null },
        sessionDirectory: { type: String, default: null },
        runState: { type: String, required: true, default: "idle" },
        resolved: { type: Boolean, default: false },
        error: { type: String, default: null },
        lastText: { type: String, default: "" },
        spec: { type: String, default: null },
        lastPrompt: { type: Schema.Types.Mixed, default: null },
        pendingForms: { type: [Schema.Types.Mixed], default: [] },
        pendingPermissions: { type: [Schema.Types.Mixed], default: [] },
        usage: { type: Schema.Types.Mixed, default: () => ({ costUsd: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 }) },
        heartbeatAt: { type: Date, default: null },
        startedAt: { type: Date, default: () => new Date() },
    },
    { collection: "task_refinements", versionKey: false, timestamps: true, minimize: false },
)

if (process.env.NODE_ENV === "development") {
    delete models.TaskRefinement
}

export const TaskRefinement: Model<ITaskRefinement> = (models.TaskRefinement as Model<ITaskRefinement>) || model<ITaskRefinement>("TaskRefinement", TaskRefinementSchema)
