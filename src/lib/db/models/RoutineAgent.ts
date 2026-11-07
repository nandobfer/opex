import { Schema, model, models, type Model, type Types } from "mongoose"
import type { EncryptedSecret } from "@/lib/crypto/secretBox"
import type { RoutineEntryTarget, RoutineEngine, RoutineLimits, RoutineOpencodeEngine, RoutineOpexEngine, RoutineTrigger } from "@/features/routine-agents/schemas"
import type { RoutineAgentStatus, RoutineProvisioningStatus, RoutineRunStatus, RoutineTriggerOrigin } from "@/features/routine-agents/status"

/**
 * Coleções dos agentes rotineiros (OPE-130): `routine_agents`, `routine_runs`, `routine_run_steps`,
 * `routine_entries`, `routine_agent_secrets` e `routine_agent_settings`. Ver `aicontext/modules/routine-agents.md`. Os índices
 * são garantidos pela migração `ensure-routine-agent-indexes`.
 */

export interface IRoutineTriggerState {
    trigger: RoutineTrigger
    nextAt: Date | null
    lastFiredAt: Date | null
}

export interface IRoutineProvisioning {
    status: RoutineProvisioningStatus
    error: string | null
    at: Date | null
    steps: { identity?: boolean; agent: boolean; token: boolean; channels: boolean; extras: boolean; workdir: boolean }
    channels: string[]
    extras: { channel: string; name: string; reason: string; created: boolean }[]
    /** Canais que o dono removeu/bloqueou (OPE-143): o provisionamento nunca os assina nem cria. Ausente = vazio. */
    blocked?: { channel: string; name: string; at: Date }[]
    warnings: string[]
}

export interface IRoutineAgentToken {
    tokenId: string
    prefix: string
    secret: EncryptedSecret
    issuedAt: Date
}

export interface IRoutineAgent {
    /** Vazio enquanto o subagente de provisionamento gera (D8). */
    name: string
    nameKey: string
    slug: string
    objective: string
    /** Campos gerados pelo subagente (selo "Gerado"; some quando o dono edita o campo). */
    generated: { name: boolean; objective: boolean }
    instructions: string
    engine: RoutineEngine
    opex: RoutineOpexEngine
    opencode: RoutineOpencodeEngine
    confirmIrreversible: boolean
    limits: RoutineLimits
    triggers: IRoutineTriggerState[]
    status: RoutineAgentStatus
    provisioning: IRoutineProvisioning
    engramindToken: IRoutineAgentToken | null
    workdir: string | null
    runSeq: number
    lastRunAt: Date | null
    /** Instância (processo) que roda o provisionamento em andamento e o último batimento dela (OPE-147). */
    provisioningInstance: string | null
    provisioningBeatAt: Date | null
    createdAt: Date
    updatedAt: Date
}

const RoutineAgentSchema = new Schema<IRoutineAgent>(
    {
        name: { type: String, default: "" },
        nameKey: { type: String, required: true },
        slug: { type: String, required: true },
        objective: { type: String, default: "" },
        generated: { type: Schema.Types.Mixed, default: { name: false, objective: false } },
        instructions: { type: String, default: "" },
        engine: { type: String, enum: ["opex", "opencode"], required: true },
        opex: { type: Schema.Types.Mixed, required: true },
        opencode: { type: Schema.Types.Mixed, required: true },
        confirmIrreversible: { type: Boolean, default: true },
        limits: { type: Schema.Types.Mixed, required: true },
        triggers: { type: Schema.Types.Mixed, default: [] },
        status: { type: String, enum: ["active", "paused", "archived"], default: "active" },
        provisioning: { type: Schema.Types.Mixed, required: true },
        engramindToken: { type: Schema.Types.Mixed, default: null },
        workdir: { type: String, default: null },
        runSeq: { type: Number, default: 0 },
        lastRunAt: { type: Date, default: null },
        provisioningInstance: { type: String, default: null },
        provisioningBeatAt: { type: Date, default: null },
    },
    { collection: "routine_agents", versionKey: false, timestamps: true, minimize: false },
)
RoutineAgentSchema.index({ nameKey: 1 }, { unique: true })
RoutineAgentSchema.index({ slug: 1 }, { unique: true })
RoutineAgentSchema.index({ status: 1, updatedAt: -1 })

export interface IRoutinePendingAction {
    id: string
    summary: string
    kind: "request" | "tool"
    toolName: string | null
    toolLabel: string | null
    /** Entrada original da ferramenta interceptada (cifrada: pode ter segredo). */
    input: EncryptedSecret | null
    /** Entrada sem segredos (`redact`) para a tela. */
    displayInput: string | null
    requestedAt: Date
    resolvedAt: Date | null
    resolution: "confirmed" | "rejected" | null
    note: string | null
    /** Instância que executa a resposta do dono (ação confirmada) e o último batimento dela (OPE-147). */
    resolvingBy?: string | null
    resolvingBeatAt?: Date | null
}

export interface IRoutineRunSnapshot {
    engine: RoutineEngine
    opex: RoutineOpexEngine
    opencode: RoutineOpencodeEngine
    confirmIrreversible: boolean
    limits: RoutineLimits
}

export interface IRoutineRun {
    agentId: Types.ObjectId
    seq: number
    origin: RoutineTriggerOrigin
    triggerId: string | null
    request: string | null
    payload: unknown
    status: RoutineRunStatus
    snapshot: IRoutineRunSnapshot
    opencodeSessionId: string | null
    /** Histórico do modelo (motor Opex), JSON já sem segredos nas entradas das ferramentas. */
    messages: string | null
    activeMs: number
    waitingMs: number
    liveWaitMs: number
    activationStartedAt: Date | null
    /** Turno vivo (OPE-147): id da ativação, instância (processo) que a roda e o último batimento. */
    activationId: string | null
    instance: string | null
    heartbeatAt: Date | null
    /** Interrupções do turno (sem batimento): a primeira volta para a fila, a segunda vira Erro. */
    interruptions: number
    parkedAt: Date | null
    tokens: number
    costUsd: number | null
    costPartial: boolean
    hibernation: { at: Date; reason: string } | null
    pendingAction: IRoutinePendingAction | null
    /** Texto da retomada (motivo da hibernação, resultado da confirmação) entregue no próximo turno. */
    resumeNote: string | null
    mcp: { name: string; secretHash: string } | null
    queuedAt: Date
    startedAt: Date | null
    finishedAt: Date | null
    report: string | null
    error: string | null
    warnings: string[]
    delayMs: number | null
    createdAt: Date
    updatedAt: Date
}

const RoutineRunSchema = new Schema<IRoutineRun>(
    {
        agentId: { type: Schema.Types.ObjectId, required: true },
        seq: { type: Number, required: true },
        origin: { type: String, required: true },
        triggerId: { type: String, default: null },
        request: { type: String, default: null },
        payload: { type: Schema.Types.Mixed, default: null },
        status: { type: String, enum: ["queued", "running", "waiting", "hibernating", "awaiting_confirmation", "completed", "error", "canceled", "expired"], default: "queued" },
        snapshot: { type: Schema.Types.Mixed, required: true },
        opencodeSessionId: { type: String, default: null },
        messages: { type: String, default: null },
        activeMs: { type: Number, default: 0 },
        waitingMs: { type: Number, default: 0 },
        liveWaitMs: { type: Number, default: 0 },
        activationStartedAt: { type: Date, default: null },
        activationId: { type: String, default: null },
        instance: { type: String, default: null },
        heartbeatAt: { type: Date, default: null },
        interruptions: { type: Number, default: 0 },
        parkedAt: { type: Date, default: null },
        tokens: { type: Number, default: 0 },
        costUsd: { type: Number, default: null },
        costPartial: { type: Boolean, default: false },
        hibernation: { type: Schema.Types.Mixed, default: null },
        pendingAction: { type: Schema.Types.Mixed, default: null },
        resumeNote: { type: String, default: null },
        mcp: { type: Schema.Types.Mixed, default: null },
        queuedAt: { type: Date, required: true },
        startedAt: { type: Date, default: null },
        finishedAt: { type: Date, default: null },
        report: { type: String, default: null },
        error: { type: String, default: null },
        warnings: { type: [String], default: [] },
        delayMs: { type: Number, default: null },
    },
    { collection: "routine_runs", versionKey: false, timestamps: true, minimize: false },
)
RoutineRunSchema.index({ agentId: 1, createdAt: -1 })
RoutineRunSchema.index({ agentId: 1, status: 1, queuedAt: 1 })
RoutineRunSchema.index({ status: 1, "hibernation.at": 1 })

export interface IRoutineRunStep {
    runId: Types.ObjectId
    agentId: Types.ObjectId
    kind: "text" | "tool" | "wait" | "hibernate" | "confirmation" | "notice" | "resume"
    label: string
    detail: string | null
    toolName: string | null
    durationMs: number | null
    error: boolean
    createdAt: Date
}

const RoutineRunStepSchema = new Schema<IRoutineRunStep>(
    {
        runId: { type: Schema.Types.ObjectId, required: true },
        agentId: { type: Schema.Types.ObjectId, required: true },
        kind: { type: String, required: true },
        label: { type: String, required: true },
        detail: { type: String, default: null },
        toolName: { type: String, default: null },
        durationMs: { type: Number, default: null },
        error: { type: Boolean, default: false },
    },
    { collection: "routine_run_steps", versionKey: false, timestamps: { createdAt: true, updatedAt: false } },
)
RoutineRunStepSchema.index({ runId: 1, createdAt: 1 })

export interface IRoutineEntry {
    agentId: Types.ObjectId
    target: RoutineEntryTarget
    channel: string
    text: string
    memoryId: string | null
    createdAt: Date
}

const RoutineEntrySchema = new Schema<IRoutineEntry>(
    {
        agentId: { type: Schema.Types.ObjectId, required: true },
        target: { type: String, enum: ["agent", "global"], required: true },
        channel: { type: String, required: true },
        text: { type: String, required: true },
        memoryId: { type: String, default: null },
    },
    { collection: "routine_entries", versionKey: false, timestamps: { createdAt: true, updatedAt: false } },
)
RoutineEntrySchema.index({ agentId: 1, createdAt: -1 })

/** Segredo do agente rotineiro (OPE-130, D5): o valor só entra (cifrado) e nunca sai pela API. */
export interface IRoutineAgentSecret {
    agentId: Types.ObjectId
    name: string
    description: string
    value: EncryptedSecret
    allowedHosts: string[]
    lastUsedAt: Date | null
    createdAt: Date
    updatedAt: Date
}

const RoutineAgentSecretSchema = new Schema<IRoutineAgentSecret>(
    {
        agentId: { type: Schema.Types.ObjectId, required: true },
        name: { type: String, required: true },
        description: { type: String, default: "" },
        value: { type: Schema.Types.Mixed, required: true },
        allowedHosts: { type: [String], default: [] },
        lastUsedAt: { type: Date, default: null },
    },
    { collection: "routine_agent_secrets", versionKey: false, timestamps: true },
)
RoutineAgentSecretSchema.index({ agentId: 1, name: 1 }, { unique: true })

export interface IRoutineAgentSettings {
    _id: string
    provider: string | null
    model: string
    variant: string | null
    agent: string | null
    updatedAt: Date
}

const RoutineAgentSettingsSchema = new Schema<IRoutineAgentSettings>(
    {
        _id: { type: String, required: true },
        provider: { type: String, default: null },
        model: { type: String, default: "" },
        variant: { type: String, default: null },
        agent: { type: String, default: null },
    },
    { collection: "routine_agent_settings", versionKey: false, timestamps: { createdAt: false, updatedAt: true } },
)

export const RoutineAgent: Model<IRoutineAgent> = (models.RoutineAgent as Model<IRoutineAgent>) ?? model<IRoutineAgent>("RoutineAgent", RoutineAgentSchema)
export const RoutineRun: Model<IRoutineRun> = (models.RoutineRun as Model<IRoutineRun>) ?? model<IRoutineRun>("RoutineRun", RoutineRunSchema)
export const RoutineRunStep: Model<IRoutineRunStep> = (models.RoutineRunStep as Model<IRoutineRunStep>) ?? model<IRoutineRunStep>("RoutineRunStep", RoutineRunStepSchema)
export const RoutineEntry: Model<IRoutineEntry> = (models.RoutineEntry as Model<IRoutineEntry>) ?? model<IRoutineEntry>("RoutineEntry", RoutineEntrySchema)
export const RoutineAgentSecret: Model<IRoutineAgentSecret> =
    (models.RoutineAgentSecret as Model<IRoutineAgentSecret>) ?? model<IRoutineAgentSecret>("RoutineAgentSecret", RoutineAgentSecretSchema)
export const RoutineAgentSettings: Model<IRoutineAgentSettings> =
    (models.RoutineAgentSettings as Model<IRoutineAgentSettings>) ?? model<IRoutineAgentSettings>("RoutineAgentSettings", RoutineAgentSettingsSchema)
