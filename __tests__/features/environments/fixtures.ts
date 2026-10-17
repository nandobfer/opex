import { memoryModel } from "../../helpers/memory-model"
import {
    DEFAULT_ENVIRONMENT,
    DEFAULT_REPO_CONFIG,
    DEFAULT_ENVIRONMENT_SETTINGS,
    type AgentResult,
} from "@/features/environments/schemas"
export const store = {
    env: memoryModel(),
    repo: memoryModel(),
    op: memoryModel(),
    image: memoryModel(),
    deployment: memoryModel(),
    log: memoryModel(),
    viewers: memoryModel(),
    project: memoryModel(),
}
export const repoId = "aaaaaaaaaaaaaaaaaaaaaaaa"
export const envId = "bbbbbbbbbbbbbbbbbbbbbbbb"
export const imageId = "cccccccccccccccccccccccc"
export const opId = "dddddddddddddddddddddddd"
export const config = { ...DEFAULT_ENVIRONMENT, name: "Produção", slug: "producao", directory: "/srv/app" }
export const settings = { ...DEFAULT_ENVIRONMENT_SETTINGS, enabled: true, model: "openai/model" }
export const observed: AgentResult = {
    verified: true,
    healthy: true,
    quiescent: true,
    dbVersion: "m002",
    databaseCertain: true,
    evidence: ["Container saudável e migração m002 comprovada"],
    migrations: ["m002"],
    images: [
        {
            service: "app",
            imageId: `sha256:${"a".repeat(64)}`,
            tag: "app:2",
            version: "2",
            builtAt: "2026-10-16T12:00:00Z",
        },
    ],
    compose: [{ service: "app", image: "app:2", ports: ["3100:3100"], volumes: [], variables: ["PORT"] }],
}
export function resetStore() {
    for (const model of Object.values(store)) model.docs.length = 0
    store.project.docs.push({
        _id: repoId,
        name: "App",
        repo: "org/app",
        repoUrl: "https://github.com/org/app",
        enabled: true,
    })
    store.env.docs.push({
        _id: envId,
        projectId: repoId,
        slug: config.slug,
        config,
        secretVariables: null,
        revision: 0,
        dbVersion: "m002",
        observedAt: null,
        compose: [],
        activeOperationId: null,
        createdBy: "local",
        updatedBy: "local",
        createdAt: new Date(),
        updatedAt: new Date(),
    })
    store.repo.docs.push({ _id: repoId, projectId: repoId, config: DEFAULT_REPO_CONFIG, secrets: null, revision: 0 })
}
export function seedOperation(overrides: Record<string, unknown> = {}) {
    store.env.docs[0].activeOperationId = opId
    store.op.docs.push({
        _id: opId,
        environmentId: envId,
        projectId: repoId,
        actorId: "local",
        clientId: null,
        requestId: "00000000-0000-4000-8000-000000000000",
        kind: "publish",
        method: "host",
        state: "running",
        phase: "pending",
        stage: "Agente",
        sessionId: null,
        startedAt: new Date(),
        finishedAt: null,
        turnStartedAt: null,
        heartbeatAt: new Date(),
        evidence: [],
        migrations: [],
        error: null,
        result: null,
        config,
        agentSettings: settings,
        repoConfig: DEFAULT_REPO_CONFIG,
        repoRevision: 0,
        environmentRevision: 0,
        repo: "org/app",
        repoUrl: "https://github.com/org/app",
        imageId: null,
        riskConfirmed: false,
        runId: null,
        runUrl: null,
        cdDispatched: false,
        cdRequestedAt: null,
        expectedSha: null,
        accessPath: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    })
}
