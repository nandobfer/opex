import { Schema, model, models, type Model } from "mongoose"
import type {
    AgentResult,
    EnvironmentInput,
    OperationInput,
    RepoConfigInput,
    EnvironmentSettings,
} from "@/features/environments/schemas"
export interface IEnvironmentOperation {
    environmentId: string
    projectId: string
    actorId: string
    clientId: string | null
    requestId: string
    kind: OperationInput["kind"]
    method: OperationInput["method"]
    state: "queued" | "running" | "reconciling" | "succeeded" | "degraded" | "failed" | "interrupted"
    stage: string
    steps: { name: string; at: Date }[]
    phase: string
    turnStartedAt: Date | null
    sessionId: string | null
    startedAt: Date | null
    finishedAt: Date | null
    heartbeatAt: Date | null
    error: string | null
    failureCode: string | null
    evidence: string[]
    migrations: string[]
    result: AgentResult | null
    config: EnvironmentInput
    agentSettings: EnvironmentSettings
    repoConfig: RepoConfigInput
    repoRevision: number
    environmentRevision: number
    repo: string
    repoUrl: string
    imageId: string | null
    riskConfirmed: boolean
    runId: number | null
    runUrl: string | null
    cdDispatched: boolean
    cdRequestedAt: Date | null
    expectedSha: string | null
    accessPath: string | null
    createdAt: Date
    updatedAt: Date
}
const schema = new Schema<IEnvironmentOperation>(
    {
        environmentId: { type: String, required: true, index: true },
        projectId: { type: String, required: true },
        actorId: { type: String, required: true },
        clientId: { type: String, default: null },
        requestId: { type: String, required: true },
        kind: { type: String, required: true },
        method: { type: String, required: true },
        state: { type: String, required: true, index: true },
        stage: { type: String, required: true },
        steps: { type: [{ _id: false, name: String, at: Date }], default: [] },
        phase: { type: String, default: "pending" },
        turnStartedAt: { type: Date, default: null },
        sessionId: { type: String, default: null },
        startedAt: { type: Date, default: null },
        finishedAt: { type: Date, default: null },
        heartbeatAt: { type: Date, default: null },
        error: { type: String, default: null },
        failureCode: { type: String, default: null },
        evidence: { type: [String], default: [] },
        migrations: { type: [String], default: [] },
        result: { type: Schema.Types.Mixed, default: null },
        config: { type: Schema.Types.Mixed, required: true },
        agentSettings: { type: Schema.Types.Mixed, required: true },
        repoConfig: { type: Schema.Types.Mixed, required: true },
        repoRevision: { type: Number, required: true },
        environmentRevision: { type: Number, required: true },
        repo: { type: String, required: true },
        repoUrl: { type: String, required: true },
        imageId: { type: String, default: null },
        riskConfirmed: { type: Boolean, default: false },
        runId: { type: Number, default: null },
        runUrl: { type: String, default: null },
        cdDispatched: { type: Boolean, default: false },
        cdRequestedAt: { type: Date, default: null },
        expectedSha: { type: String, default: null },
        accessPath: { type: String, default: null, select: false },
    },
    { collection: "environment_operations", timestamps: true },
)
schema.index({ actorId: 1, requestId: 1 }, { unique: true })
schema.index({ state: 1, createdAt: 1 })
export const EnvironmentOperation: Model<IEnvironmentOperation> =
    (models.EnvironmentOperation as Model<IEnvironmentOperation>) ||
    model<IEnvironmentOperation>("EnvironmentOperation", schema)
