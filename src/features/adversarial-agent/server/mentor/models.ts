import { Schema, model, models, type Model, type Types } from "mongoose"
import { dbConnect } from "@/lib/db"
import type { MentorCaseStatus, MentorLevel, MentorOperation, MentorRunStatus, MentorSkipKind, MentorSource, MentorTarget, MentorUserTrigger } from "../../mentor/constants"

/** Transcrição lida por uma execução de aprendizado (OPE-165): só tamanhos e se houve compactação. */
export interface IMentorTranscriptInfo {
    originalChars: number
    sentChars: number
    compacted: boolean
    level: number
    aboveThreshold: boolean
    eventCount: number
    forkCount: number
}

/**
 * Uma execução do Agente Mentor — `adversarial_mentor_runs` (índices garantidos no primeiro uso).
 * `kind: "learning"` (OPE-165) é o aprendizado na conclusão da mesa (um registro por conclusão e
 * tentativa, idempotente por `{ workbenchId, completedAt, attempt }`); sem `kind`, as execuções antigas
 * (uma lição por cadeia de turnos).
 */
export interface IMentorRun {
    _id: Types.ObjectId
    kind?: "learning" | null
    /** Conclusão que disparou o aprendizado (`completedAt` da mesa). */
    completedAt?: Date | null
    attempt?: number | null
    /** Execução falha que esta repete (Tentar novamente). */
    retryOf?: string | null
    /** Como a mesa concluiu: `merge` (PR) ou `manual`. */
    completionKind?: "merge" | "manual" | null
    heartbeatAt?: Date | null
    transcript?: IMentorTranscriptInfo | null
    /** Modelo do digestor usado. */
    digestModel?: string | null
    caseCount?: number | null
    /** Casos do digestor que saíram (inválidos ou acima do teto técnico). */
    digestDiscarded?: number | null
    operationCounts?: Partial<Record<MentorOperation | "failed", number>> | null
    /** Operações aplicadas por lista de destino (métricas do Mentor). */
    targetCounts?: Record<string, number> | null
    budgetUsd?: number | null
    /** `budget` quando o orçamento abortou a execução. */
    abortReason?: "budget" | null
    workbenchId: string
    centralId: string
    taskId: string
    taskCode: string
    taskTitle: string
    sources: MentorSource[]
    trigger: MentorUserTrigger | null
    /** Início da mensagem do usuário (para a lista; nunca vira texto de memória). */
    userMessage: string | null
    lessonCount: number
    status: MentorRunStatus
    level: MentorLevel
    score: number | null
    threshold: number
    deciderReason: string | null
    /** Triador (OPE-97): lista escolhida, confiança, motivo e probabilidades (JEV). Execuções antigas não têm. */
    target?: MentorTarget | null
    routerConfidence?: number | null
    routerReason?: string | null
    routerProbabilities?: Record<string, number> | null
    writerAction: "create" | "update" | "skip" | null
    writerReason: string | null
    /** OPE-132: motivo do skip e a memória da lista de destino citada como cobertura. */
    writerSkipKind?: MentorSkipKind | null
    writerCoveredBy?: { memoryId: string; target: MentorTarget } | null
    /** Pedido de skip recusado por citar cobertura em outra lista (fica visível no detalhe). */
    skipRejection?: string | null
    /** Parte separada recusada pelo sanitizador (a memória principal segue). */
    splitRejection?: string | null
    sanitizerReason: string | null
    /** Proposta do redator (no modo Sugerir, aguarda Aprovar/Descartar). Antigas não têm `target` (= adversário). */
    proposal: { action: "create" | "update"; memoryId: string | null; text: string; target?: MentorTarget; centralId?: string | null } | null
    /** Parte separada da lição (global + central), gravada na outra lista do desenvolvedor. */
    extraProposal?: { action: "create" | "update"; memoryId: string | null; text: string; target: MentorTarget; centralId: string | null } | null
    memoryId: string | null
    extraMemoryId?: string | null
    error: string | null
    costUsd: number
    durationMs: number | null
    startedAt: Date | null
    finishedAt: Date | null
    createdAt: Date
    updatedAt: Date
}

const MentorRunSchema = new Schema<IMentorRun>(
    {
        kind: { type: String, default: null },
        completedAt: { type: Date, default: null },
        attempt: { type: Number, default: null },
        retryOf: { type: String, default: null },
        completionKind: { type: String, default: null },
        heartbeatAt: { type: Date, default: null },
        transcript: { type: Schema.Types.Mixed, default: null },
        digestModel: { type: String, default: null },
        caseCount: { type: Number, default: null },
        digestDiscarded: { type: Number, default: null },
        operationCounts: { type: Schema.Types.Mixed, default: null },
        targetCounts: { type: Schema.Types.Mixed, default: null },
        budgetUsd: { type: Number, default: null },
        abortReason: { type: String, default: null },
        workbenchId: { type: String, required: true },
        centralId: { type: String, required: true },
        taskId: { type: String, required: true },
        taskCode: { type: String, required: true },
        taskTitle: { type: String, default: "" },
        sources: { type: [String], default: [] },
        trigger: { type: String, default: null },
        userMessage: { type: String, default: null },
        lessonCount: { type: Number, default: 0 },
        status: { type: String, required: true },
        level: { type: String, required: true },
        score: { type: Number, default: null },
        threshold: { type: Number, required: true },
        deciderReason: { type: String, default: null },
        target: { type: String, default: null },
        routerConfidence: { type: Number, default: null },
        routerReason: { type: String, default: null },
        routerProbabilities: { type: Schema.Types.Mixed, default: null },
        writerAction: { type: String, default: null },
        writerReason: { type: String, default: null },
        writerSkipKind: { type: String, default: null },
        writerCoveredBy: { type: Schema.Types.Mixed, default: null },
        skipRejection: { type: String, default: null },
        splitRejection: { type: String, default: null },
        sanitizerReason: { type: String, default: null },
        proposal: { type: Schema.Types.Mixed, default: null },
        extraProposal: { type: Schema.Types.Mixed, default: null },
        memoryId: { type: String, default: null },
        extraMemoryId: { type: String, default: null },
        error: { type: String, default: null },
        costUsd: { type: Number, default: 0 },
        durationMs: { type: Number, default: null },
        startedAt: { type: Date, default: null },
        finishedAt: { type: Date, default: null },
    },
    { collection: "adversarial_mentor_runs", versionKey: false, timestamps: true },
)
MentorRunSchema.index({ createdAt: -1 })
MentorRunSchema.index({ status: 1, createdAt: -1 })
// Uma execução por conclusão e tentativa (OPE-165): o mesmo `completedAt` nunca gera duas.
MentorRunSchema.index({ workbenchId: 1, completedAt: 1, attempt: 1 }, { unique: true, partialFilterExpression: { kind: "learning" } })
MentorRunSchema.index({ workbenchId: 1, createdAt: -1 })

export const MentorRun: Model<IMentorRun> = (models.AdversarialMentorRun as Model<IMentorRun>) || model<IMentorRun>("AdversarialMentorRun", MentorRunSchema)

/** Operação aplicada (ou tentada) por um caso do aprendizado. */
export interface IMentorCaseOperation {
    op: MentorOperation
    target: MentorTarget
    centralId: string | null
    /** Memória criada, atualizada, que recebeu a fusão ou arquivada. */
    memoryId: string | null
    /** Absorvidas (arquivadas) numa fusão. */
    absorbed: string[]
    text: string | null
    reason: string
    status: "applied" | "failed"
    error: string | null
}

/** Um caso extraído da transcrição pelo digestor (OPE-165) — `adversarial_mentor_run_cases`. */
export interface IMentorRunCase {
    _id: Types.ObjectId
    runId: string
    workbenchId: string
    index: number
    lesson: string
    evidence: string[]
    nature: string
    scope: string
    detection: string | null
    status: MentorCaseStatus
    score: number | null
    deciderReason: string | null
    target: MentorTarget | null
    centralId: string | null
    routerConfidence: number | null
    routerReason: string | null
    writerReason: string | null
    skipKind: MentorSkipKind | null
    coveredBy: string | null
    rejection: string | null
    operations: IMentorCaseOperation[]
    error: string | null
    createdAt: Date
    updatedAt: Date
}

const MentorRunCaseSchema = new Schema<IMentorRunCase>(
    {
        runId: { type: String, required: true },
        workbenchId: { type: String, required: true },
        index: { type: Number, required: true },
        lesson: { type: String, required: true },
        evidence: { type: [String], default: [] },
        nature: { type: String, required: true },
        scope: { type: String, required: true },
        detection: { type: String, default: null },
        status: { type: String, required: true },
        score: { type: Number, default: null },
        deciderReason: { type: String, default: null },
        target: { type: String, default: null },
        centralId: { type: String, default: null },
        routerConfidence: { type: Number, default: null },
        routerReason: { type: String, default: null },
        writerReason: { type: String, default: null },
        skipKind: { type: String, default: null },
        coveredBy: { type: String, default: null },
        rejection: { type: String, default: null },
        operations: { type: [Schema.Types.Mixed] as unknown as IMentorCaseOperation[], default: [] },
        error: { type: String, default: null },
    },
    { collection: "adversarial_mentor_run_cases", versionKey: false, timestamps: true, minimize: false },
)
MentorRunCaseSchema.index({ runId: 1, index: 1 }, { unique: true })

export const MentorRunCase: Model<IMentorRunCase> = (models.AdversarialMentorRunCase as Model<IMentorRunCase>) || model<IMentorRunCase>("AdversarialMentorRunCase", MentorRunCaseSchema)

let indexesReady: Promise<void> | null = null

export async function mentorDb(): Promise<void> {
    await dbConnect()
    indexesReady ??= Promise.all([MentorRun.createIndexes(), MentorRunCase.createIndexes()])
        .then(() => undefined)
        .catch((error: unknown) => {
            indexesReady = null
            throw error
        })
    await indexesReady
}
