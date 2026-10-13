import { logger } from "@/lib/logger"
import { DomainError } from "@/lib/api/route"
import { recordAudit, AcaoAuditoria } from "@/lib/audit/record"
import { EnvironmentOperation, type IEnvironmentOperation } from "@/lib/db/models/EnvironmentOperation"
import { Environment } from "@/lib/db/models/Environment"
import { EnvironmentImage } from "@/lib/db/models/EnvironmentImage"
import { buildImageTag } from "../logic"
import { ENVIRONMENT_OPERATION_AUDIT_ENTITY } from "../constants"
import { parseDbVersionText } from "../parsers"
import type { EnvironmentActor } from "./actor"
import { assertCanOperate } from "./actor"
import { loadEnvironmentRuntime, type EnvironmentRuntime } from "./context"
import { buildComposeOverride, composeBuild, composePs, composeUp, gitSync, inferContainerPort, listProjectImages } from "./docker"
import { writeHostFile } from "./host-files"
import { fetchComposeFile } from "./compose"
import { readDatabaseVersion } from "./database"
import { environmentLogger, type EnvironmentLogger } from "./logs"
import { claimOperation, createOperation, finishOperation, operationDto, patchStep, renewLease } from "./operations"
import { publishEnvironmentsUpdated, publishOperationEvent } from "./realtime"
import { dispatchWorkflow, findRunAfterDispatch, getRun, isRunFinished } from "./ci-cd"
import { isAnyLocalBuildRunning, localQueuePosition } from "./queue"
import type { OperationDto, PublishInput } from "../types"

/**
 * Publicação de um ambiente. **Local**: clona/atualiza, builda, checa o banco, sobe e valida a saúde,
 * gravando o metadado da imagem. **CD**: dispara e acompanha o workflow configurado. A operação é
 * persistida antes de rodar e executada em segundo plano (sobrevive a fechar a tela).
 */

const LEASE_OWNER = `${process.pid}:${Date.now()}`

export async function startPublish(actor: EnvironmentActor, envId: string, input: PublishInput): Promise<OperationDto> {
    const runtime = await loadEnvironmentRuntime(envId)
    assertCanOperate(actor, runtime.env.projectId)
    const method = input.method
    if (method === "cd" && !runtime.project.repo) throw new DomainError(400, "Este repositório não tem vínculo com o GitHub.", "GITHUB_NOT_LINKED")
    const branch = input.branch?.trim() || runtime.env.branch
    const operation = await createOperation({
        environmentId: String(runtime.env._id),
        projectId: runtime.env.projectId,
        type: "publish",
        method,
        userId: actor.userId,
        configSnapshot: {
            branch,
            composeFile: runtime.invocation.composeFile,
            projectName: runtime.projectName,
            service: runtime.env.composeService || null,
            publishedPort: runtime.env.publishedPort ?? null,
            mode: runtime.connection.mode,
        },
    })
    await Environment.updateOne({ _id: runtime.env._id }, { $set: { lastOperationId: String(operation._id) } })
    await recordAudit({
        userId: actor.userId,
        entidade: ENVIRONMENT_OPERATION_AUDIT_ENTITY,
        entidadeId: String(operation._id),
        acao: AcaoAuditoria.EXECUTAR,
        depois: { type: "publish", method, branch, environmentId: String(runtime.env._id) },
    })
    // Fire-and-forget: o trabalho continua no servidor.
    if (method === "local") void pumpEnvironmentQueue()
    else void runPublishOperation(String(operation._id), LEASE_OWNER)
    const position = method === "local" ? await localQueuePosition(String(runtime.env._id)) : null
    return operationDto(operation, position)
}

class StepRunner {
    constructor(
        private readonly operationId: string,
        private readonly log: EnvironmentLogger,
    ) {}

    private async publish(): Promise<void> {
        const operation = await EnvironmentOperation.findById(this.operationId).lean()
        if (operation) await publishOperationEvent(operation)
    }

    async start(stepId: string): Promise<void> {
        await patchStep(this.operationId, stepId, { status: "running" })
        await renewLease(this.operationId, LEASE_OWNER)
        await this.publish()
    }

    async done(stepId: string, message?: string): Promise<void> {
        await patchStep(this.operationId, stepId, { status: "done", message })
        await this.publish()
    }

    async fail(stepId: string, error: unknown): Promise<never> {
        const message = error instanceof Error ? error.message : String(error)
        this.log.error(`Falha em ${stepId}`, error)
        await patchStep(this.operationId, stepId, { status: "failed", message })
        await this.publish()
        throw error
    }

    async warn(stepId: string, message: string): Promise<void> {
        this.log.warn(message)
        await patchStep(this.operationId, stepId, { status: "failed", message })
        await this.publish()
    }

    info(message: string, data?: unknown): void {
        this.log.info(message, data)
    }
}

/** Executa uma publicação (local ou CD). Nunca lança para quem chamou (o erro fica na operação). */
export async function runPublishOperation(operationId: string, owner: string): Promise<void> {
    const claimed = await claimOperation(operationId, owner)
    if (!claimed) return
    try {
        if (claimed.method === "cd") await executeCdPublish(claimed, owner)
        else await executeLocalPublish(claimed)
    } catch (error) {
        logger.error({ err: error, operationId }, "[environments] Publicação falhou")
        await finishOperation(operationId, "failed", error instanceof Error ? error.message : String(error))
        const operation = await EnvironmentOperation.findById(operationId).lean()
        if (operation) await publishOperationEvent(operation)
    }
}

async function executeLocalPublish(operation: IEnvironmentOperation): Promise<void> {
    const runtime = await loadEnvironmentRuntime(operation.environmentId)
    const log = environmentLogger({ environmentId: operation.environmentId, scope: "publish", secrets: runtime.secrets })
    const runner = new StepRunner(String(operation._id), log)
    const branch = String(operation.configSnapshot.branch ?? runtime.env.branch)
    const service = runtime.env.composeService || runtime.invocation.projectName
    const builtAt = new Date()

    try {
        runner.info(`Publicando ${runtime.env.name} (${branch})`)

        await runner.start("git")
        const { result: gitResult, commitSha } = await gitSync(runtime.host, {
            repoUrl: runtime.project.repoUrl,
            branch,
            directory: runtime.directory,
        })
        if (gitResult.exitCode !== 0) await runner.fail("git", new DomainError(502, `Falha ao clonar/atualizar: ${gitResult.output.slice(0, 400)}`, "GIT_FAILED"))
        await runner.done("git", commitSha ? `Commit ${commitSha.slice(0, 7)}` : undefined)

        // Compose base (do checkout) para inferir o serviço e a porta do container.
        const compose = await fetchComposeFile(runtime.project.repo, branch, runtime.invocation.composeFile).catch(() => null)
        const containerPort = compose ? inferContainerPort(compose.summary, runtime.env.composeService || null) : null
        const expectedDb = await readExpectedDbVersion(runtime, log).catch(() => null)

        await runner.start("build")
        const tag = buildImageTag(expectedDb, builtAt)
        await writeHostFile(runtime.host, runtime.overrideFile, buildComposeOverride({
            service: runtime.env.composeService || service,
            image: tag,
            publishedPort: runtime.env.publishedPort,
            containerPort,
            cpus: runtime.env.resources.cpus,
            memoryMb: runtime.env.resources.memoryMb,
            env: (runtime.env.envVars ?? []).map((variable) => ({ key: variable.key, value: variable.value })),
        }))
        const buildResult = await composeBuild(runtime.host, runtime.invocation, { cwd: runtime.directory, envFile: null })
        if (buildResult.exitCode !== 0) await runner.fail("build", new DomainError(502, `Falha no build: ${buildResult.output.slice(0, 400)}`, "BUILD_FAILED"))
        await runner.done("build", `Imagem ${tag}`)

        await runner.start("database")
        const currentDb = await readDatabaseVersion(runtime.connectionString)
        runner.info(`Versão atual do banco: ${currentDb ?? "desconhecida"}; esperada pela imagem: ${expectedDb ?? "desconhecida"}`)
        await runner.done("database", `Banco ${currentDb ?? "desconhecido"} → imagem ${expectedDb ?? "desconhecida"}`)

        await runner.start("up")
        const upResult = await composeUp(runtime.host, runtime.invocation, { cwd: runtime.directory, service: runtime.env.composeService || null })
        if (upResult.exitCode !== 0) await runner.fail("up", new DomainError(502, `Falha ao subir os containers: ${upResult.output.slice(0, 400)}`, "UP_FAILED"))
        await runner.done("up")

        // Metadados da imagem publicada.
        const images = await listProjectImages(runtime.host, runtime.invocation.projectName, { cwd: runtime.directory })
        const built = images.find((image) => image.tag === tag)
        if (built) {
            await EnvironmentImage.updateOne(
                { environmentId: operation.environmentId, imageId: built.id },
                { $set: { projectId: operation.projectId, tag, dbVersion: expectedDb, builtAt, origin: "opex", service: runtime.env.composeService || null, commitSha } },
                { upsert: true },
            )
        }
        await Environment.updateOne({ _id: operation.environmentId }, { $set: { dbVersion: expectedDb } }).catch(() => undefined)

        await runner.start("healthcheck")
        const containers = await composePs(runtime.host, runtime.invocation, { cwd: runtime.directory })
        const running = containers.some((container) => /running/i.test(container.state))
        await Environment.updateOne(
            { _id: operation.environmentId },
            { $set: { status: { containers: containers.map((c) => ({ name: c.name, service: c.service, state: c.state, status: c.status, image: c.image })), running, checkedAt: new Date() } } },
        )
        if (runtime.env.healthcheck.enabled && runtime.env.publishedPort && !(await checkHealth(runtime))) {
            await runner.warn("healthcheck", "Publicado, mas o healthcheck não respondeu. A imagem permanece no ar.")
            await finishOperation(String(operation._id), "done", "Publicado com aviso: healthcheck não respondeu.")
        } else {
            await runner.done("healthcheck", running ? "Containers em execução" : "Sem container em execução")
            await finishOperation(String(operation._id), "done", "Publicado.")
        }
    } catch (error) {
        await finishOperation(String(operation._id), "failed", error instanceof Error ? error.message : String(error))
        const operationDoc = await EnvironmentOperation.findById(operation._id).lean()
        if (operationDoc) await publishOperationEvent(operationDoc)
        throw error
    } finally {
        await publishEnvironmentsUpdated(operation.projectId, "publish")
    }
}

async function executeCdPublish(operation: IEnvironmentOperation, owner: string): Promise<void> {
    const runtime = await loadEnvironmentRuntime(operation.environmentId)
    const log = environmentLogger({ environmentId: operation.environmentId, scope: "publish", secrets: runtime.secrets })
    const runner = new StepRunner(String(operation._id), log)
    const branch = String(operation.configSnapshot.branch ?? runtime.env.branch)
    const config = runtime.connection
    void config
    const workflow = await workflowFor(runtime)
    if (!workflow) {
        await runner.start("dispatch")
        await runner.fail("dispatch", new DomainError(400, "Configure o workflow de CD deste repositório.", "CD_WORKFLOW_MISSING"))
        return
    }
    try {
        await runner.start("dispatch")
        const since = await dispatchWorkflow(runtime.project.repo, workflow, branch, {})
        await runner.done("dispatch", `Workflow ${workflow} em ${branch}`)
        await runner.start("watch")
        await watchRun(runtime.project.repo, workflow, branch, since, String(operation._id), owner, runner)
    } catch (error) {
        await finishOperation(String(operation._id), "failed", error instanceof Error ? error.message : String(error))
        const doc = await EnvironmentOperation.findById(operation._id).lean()
        if (doc) await publishOperationEvent(doc)
        throw error
    } finally {
        await publishEnvironmentsUpdated(operation.projectId, "publish")
    }
}

async function watchRun(repo: string, workflow: string, branch: string, sinceIso: string, operationId: string, owner: string, runner: StepRunner): Promise<void> {
    let runId = (await findRunAfterDispatch(repo, workflow, branch, sinceIso))?.id?.toString() ?? null
    const deadline = Date.now() + 45 * 60_000
    while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 15_000))
        await renewLease(operationId, owner)
        if (!runId) {
            runId = (await findRunAfterDispatch(repo, workflow, branch, sinceIso))?.id?.toString() ?? null
            continue
        }
        const run = await getRun(repo, runId)
        if (!run) continue
        await EnvironmentOperation.updateOne({ _id: operationId }, { $set: { runId, runUrl: run.htmlUrl } })
        if (isRunFinished(run)) {
            if (run.conclusion === "success") {
                await runner.done("watch", `Run #${run.runNumber} concluído`)
                await finishOperation(operationId, "done", "Publicado pelo CD.")
            } else {
                await runner.fail("watch", new DomainError(502, `O workflow terminou com "${run.conclusion ?? "sem conclusão"}".`, "CD_RUN_FAILED"))
                await finishOperation(operationId, "failed", `CD: ${run.conclusion ?? "sem conclusão"}`)
            }
            return
        }
    }
    await finishOperation(operationId, "failed", "Tempo esgotado aguardando o workflow do CD.")
}

async function workflowFor(runtime: EnvironmentRuntime): Promise<string | null> {
    const { getRepoConfig } = await import("./repo-config")
    const config = await getRepoConfig(runtime.env.projectId)
    return config?.cdWorkflow?.trim() || null
}

async function readExpectedDbVersion(runtime: EnvironmentRuntime, log: EnvironmentLogger): Promise<string | null> {
    const source = runtime.env.dbVersionSource
    if (!source || source.kind === "none" || !source.value) return null
    if (source.kind === "file") {
        const result = await runtime.host.run(`cat ${JSON.stringify(source.value)}`, { cwd: runtime.directory })
        return result.exitCode === 0 ? parseDbVersionText(result.output) : null
    }
    const result = await runtime.host.run(source.value, { cwd: runtime.directory })
    if (result.exitCode !== 0) {
        log.warn(`Comando da versão de banco falhou: ${result.output.slice(0, 200)}`)
        return null
    }
    return parseDbVersionText(result.output)
}

async function checkHealth(runtime: EnvironmentRuntime): Promise<boolean> {
    const port = runtime.env.publishedPort
    if (!port) return true
    const path = runtime.env.healthcheck.path || "/"
    const seconds = Math.max(1, Math.round(runtime.env.healthcheck.timeoutMs / 1000))
    const command = `curl -fsS --max-time ${seconds} http://127.0.0.1:${port}${path}`
    const attempts = 12
    for (let i = 0; i < attempts; i++) {
        const result = await runtime.host.run(command, { cwd: runtime.directory, timeoutMs: (seconds + 5) * 1000 })
        if (result.exitCode === 0) return true
        await new Promise((resolve) => setTimeout(resolve, 5_000))
    }
    return false
}

/** Motor da fila local: inicia a próxima publicação quando não há build local em andamento. */
export async function pumpEnvironmentQueue(): Promise<void> {
    try {
        if (await isAnyLocalBuildRunning()) return
        const { waitingLocalOperations } = await import("./queue")
        const queue = await waitingLocalOperations()
        const next = queue[0]
        if (next) await runPublishOperation(String(next._id), `${LEASE_OWNER}:queue`)
    } catch (error) {
        logger.warn({ err: error }, "[environments] Falha ao processar a fila local")
    }
}
