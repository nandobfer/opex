import { Schema, model, models, type Model, type Types } from "mongoose"
import { dbConnect } from "@/lib/db"
import type { ArchitectDiagramState, ArchitectOrigin, ArchitectPhase } from "../constants"
import type { ArchitectGraph } from "../graph"

/**
 * Coleção do Agente Arquiteto (os índices são garantidos no primeiro uso, sem migração). Ver
 * `aicontext/modules/architect-agent.md`.
 */

/** Uma versão do diagrama de arquitetura de uma mesa — `architect_diagrams`. */
export interface IArchitectDiagram {
    _id: Types.ObjectId
    workbenchId: string
    centralId: string
    taskId: string
    taskCode: string
    taskTitle: string
    version: number
    planVersion: number
    planSeq: number
    depth: number
    origin: ArchitectOrigin
    feedback: string | null
    baseDiagramId: string | null
    state: ArchitectDiagramState
    progress: { phase: ArchitectPhase | null; tools: number; lastTool: string | null }
    graph: ArchitectGraph | null
    /** Rascunho ao vivo (gravado com intervalo durante a geração; fica como contexto se ela falhar). */
    draft: ArchitectGraph | null
    trimmed: { nodes: number; edges: number }
    warnings: string[]
    repaired: boolean
    /** Texto bruto da última resposta do agente. */
    report: string | null
    error: string | null
    directory: string | null
    sessionId: string | null
    /** Sessão do OpenCode que não pôde ser excluída (tentada de novo na próxima geração da mesa). */
    pendingSessionDeletion: string | null
    usage: { costUsd: number; inputTokens: number; outputTokens: number; reasoningTokens: number }
    startedAt: Date
    finishedAt: Date | null
    createdAt: Date
    updatedAt: Date
}

const ArchitectDiagramSchema = new Schema<IArchitectDiagram>(
    {
        workbenchId: { type: String, required: true },
        centralId: { type: String, required: true },
        taskId: { type: String, required: true },
        taskCode: { type: String, required: true },
        taskTitle: { type: String, default: "" },
        version: { type: Number, required: true },
        planVersion: { type: Number, required: true },
        planSeq: { type: Number, required: true },
        depth: { type: Number, required: true },
        origin: { type: String, required: true },
        feedback: { type: String, default: null },
        baseDiagramId: { type: String, default: null },
        state: { type: String, required: true },
        progress: {
            phase: { type: String, default: null },
            tools: { type: Number, default: 0 },
            lastTool: { type: String, default: null },
        },
        graph: { type: Schema.Types.Mixed, default: null },
        draft: { type: Schema.Types.Mixed, default: null },
        trimmed: {
            nodes: { type: Number, default: 0 },
            edges: { type: Number, default: 0 },
        },
        warnings: { type: [String], default: [] },
        repaired: { type: Boolean, default: false },
        report: { type: String, default: null },
        error: { type: String, default: null },
        directory: { type: String, default: null },
        sessionId: { type: String, default: null },
        pendingSessionDeletion: { type: String, default: null },
        usage: {
            costUsd: { type: Number, default: 0 },
            inputTokens: { type: Number, default: 0 },
            outputTokens: { type: Number, default: 0 },
            reasoningTokens: { type: Number, default: 0 },
        },
        startedAt: { type: Date, required: true },
        finishedAt: { type: Date, default: null },
    },
    { collection: "architect_diagrams", versionKey: false, timestamps: true },
)
ArchitectDiagramSchema.index({ workbenchId: 1, createdAt: -1 })
ArchitectDiagramSchema.index({ createdAt: -1 })

export const ArchitectDiagram: Model<IArchitectDiagram> = (models.ArchitectDiagram as Model<IArchitectDiagram>) || model<IArchitectDiagram>("ArchitectDiagram", ArchitectDiagramSchema)

let indexesReady: Promise<void> | null = null

/** Conecta e garante os índices da coleção (uma vez por processo). */
export async function architectDb(): Promise<void> {
    await dbConnect()
    indexesReady ??= ArchitectDiagram.createIndexes()
        .then(() => undefined)
        .catch((error: unknown) => {
            indexesReady = null
            throw error
        })
    await indexesReady
}
