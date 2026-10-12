import { Schema, model, models, type Model, type Types } from "mongoose"

/**
 * Desenvolvimento agêntico (Integrações › Provedores de IA › Desenvolvimento agêntico):
 * - `agentic_centrals`: uma central por projeto (repositório vinculado), com o diretório das sessões e a
 *   configuração (validada pelo schema Zod `centralConfigSchema`);
 * - `agentic_workbenches`: uma mesa de trabalho por tarefa (etapa, sessão do OpenCode, worktree,
 *   porta da prévia, versões do plano e PR);
 * - `agentic_events`: a saída da IA de cada mesa, em ordem (`seq`), para reproduzir a tela.
 */

export interface IAgenticCentral {
    _id: Types.ObjectId
    projectId: string
    projectName: string
    config: Record<string, unknown>
    lastTest: { at: Date; ok: boolean; message: string } | null
    createdAt: Date
    updatedAt: Date
}

const AgenticCentralSchema = new Schema<IAgenticCentral>(
    {
        projectId: { type: String, required: true, unique: true },
        projectName: { type: String, required: true },
        config: { type: Schema.Types.Mixed, default: {} },
        lastTest: { type: Schema.Types.Mixed, default: null },
    },
    { collection: "agentic_centrals", versionKey: false, timestamps: true, minimize: false },
)

export interface IPlanVersion {
    version: number
    text: string
    feedback: string | null
    createdAt: Date
}

/**
 * Backup do MongoDB da prévia (OPE-54): o caminho é reservado ANTES do build e o agente cria o
 * dump ali; o primeiro dump é preservado nas retentativas/correções e removido na conclusão.
 */
export interface IPreviewBackup {
    /** Pasta exclusiva do ciclo de backup (fora do worktree, sob a raiz dos worktrees). */
    dir: string
    /** Arquivo `--archive` do mongodump dentro de `dir`. */
    path: string
    createdAt: Date
}

export interface IWorkbenchPr {
    number: number
    url: string
    state: "open" | "closed" | "merged"
    mergedAt: Date | null
    mergeCommitSha: string | null
    /** Maior id de revisão já tratado (as novas pedem replanejamento). */
    lastReviewId: number
    /** Maior id de comentário (conversa ou linha) já tratado; os novos com `@opex` voltam ao planejamento. */
    lastCommentId: number
    closedNotified: boolean
    /** SHA da base do PR na última resolução de conflito iniciada (evita repetir o mesmo conflito). */
    conflictBaseSha: string | null
    /** SHA da branch do PR na última resolução de conflito iniciada; muda a cada push. */
    conflictHeadSha: string | null
}

export interface IAgenticWorkbench {
    _id: Types.ObjectId
    centralId: string
    taskId: string
    taskCode: string
    taskTitle: string
    stage: string
    runState: string
    error: string | null
    lastStage: string | null
    lastPrompt: { stage: string; text: string } | null
    /** Instante em que o último turno começou (delimita a execução acompanhada ao reconectar). */
    turnStartedAt: Date | null
    sessionId: string | null
    sessionDirectory: string | null
    /** IDs de sessões do OpenCode já desvinculadas da mesa e ainda pendentes de exclusão. */
    pendingSessionDeletions: string[]
    branch: string | null
    worktreePath: string | null
    composeProject: string | null
    port: number | null
    /** Instante em que a mesa entrou na fila global do build (`null` fora da fila); define a ordem FIFO. */
    buildQueuedAt: Date | null
    previewUrl: string | null
    previewHealthy: boolean | null
    /** Fluxo escolhido na abertura da mesa (`preview` sobe a prévia; `auto_pr` vai direto ao PR). */
    agenticFlow: string
    /** Backup do MongoDB da prévia (reservado no build); `null` quando a mesa não tem backup. */
    previewBackup: IPreviewBackup | null
    plans: IPlanVersion[]
    pendingFeedback: string | null
    pr: IWorkbenchPr | null
    pastPrs: IWorkbenchPr[]
    pendingPermissions: unknown[]
    pendingForms: unknown[]
    usage: { costUsd: number; inputTokens: number; outputTokens: number; reasoningTokens: number }
    heartbeatAt: Date | null
    startedAt: Date
    completedAt: Date | null
    createdAt: Date
    updatedAt: Date
}

const AgenticWorkbenchSchema = new Schema<IAgenticWorkbench>(
    {
        centralId: { type: String, required: true, index: true },
        taskId: { type: String, required: true, unique: true },
        taskCode: { type: String, required: true },
        taskTitle: { type: String, required: true },
        stage: { type: String, required: true, index: true },
        runState: { type: String, required: true, default: "idle" },
        error: { type: String, default: null },
        lastStage: { type: String, default: null },
        lastPrompt: { type: Schema.Types.Mixed, default: null },
        turnStartedAt: { type: Date, default: null },
        sessionId: { type: String, default: null },
        sessionDirectory: { type: String, default: null },
        pendingSessionDeletions: { type: [String], default: [] },
        branch: { type: String, default: null },
        worktreePath: { type: String, default: null },
        composeProject: { type: String, default: null },
        port: { type: Number, default: null },
        buildQueuedAt: { type: Date, default: null },
        previewUrl: { type: String, default: null },
        previewHealthy: { type: Boolean, default: null },
        agenticFlow: { type: String, default: "preview" },
        previewBackup: { type: Schema.Types.Mixed, default: null },
        plans: { type: [Schema.Types.Mixed] as unknown as IPlanVersion[], default: [] },
        pendingFeedback: { type: String, default: null },
        pr: { type: Schema.Types.Mixed, default: null },
        pastPrs: { type: [Schema.Types.Mixed] as unknown as IWorkbenchPr[], default: [] },
        pendingPermissions: { type: [Schema.Types.Mixed], default: [] },
        pendingForms: { type: [Schema.Types.Mixed], default: [] },
        usage: { type: Schema.Types.Mixed, default: () => ({ costUsd: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0 }) },
        heartbeatAt: { type: Date, default: null },
        startedAt: { type: Date, default: () => new Date() },
        completedAt: { type: Date, default: null },
    },
    { collection: "agentic_workbenches", versionKey: false, timestamps: true, minimize: false },
)
// Uma porta por mesa ativa (as concluídas liberam a porta gravando null).
AgenticWorkbenchSchema.index({ port: 1 }, { unique: true, partialFilterExpression: { port: { $type: "number" } } })
// Fila global do build: mesas aguardando, na ordem de chegada.
AgenticWorkbenchSchema.index({ buildQueuedAt: 1 }, { partialFilterExpression: { buildQueuedAt: { $type: "date" } } })

export interface IAgenticEvent {
    workbenchId: string
    seq: number
    payload: Record<string, unknown>
    ts: Date
}

const AgenticEventSchema = new Schema<IAgenticEvent>(
    {
        workbenchId: { type: String, required: true },
        seq: { type: Number, required: true },
        payload: { type: Schema.Types.Mixed, required: true },
        ts: { type: Date, required: true, default: () => new Date() },
    },
    { collection: "agentic_events", versionKey: false, minimize: false },
)
AgenticEventSchema.index({ workbenchId: 1, seq: 1 }, { unique: true })

if (process.env.NODE_ENV === "development") {
    delete models.AgenticCentral
    delete models.AgenticWorkbench
    delete models.AgenticEvent
}

export const AgenticCentral: Model<IAgenticCentral> = (models.AgenticCentral as Model<IAgenticCentral>) || model<IAgenticCentral>("AgenticCentral", AgenticCentralSchema)
export const AgenticWorkbench: Model<IAgenticWorkbench> =
    (models.AgenticWorkbench as Model<IAgenticWorkbench>) || model<IAgenticWorkbench>("AgenticWorkbench", AgenticWorkbenchSchema)
export const AgenticEvent: Model<IAgenticEvent> = (models.AgenticEvent as Model<IAgenticEvent>) || model<IAgenticEvent>("AgenticEvent", AgenticEventSchema)
