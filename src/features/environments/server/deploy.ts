import { randomBytes } from "node:crypto"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { loadCentral } from "@/features/agentic/server/centrals"
import { runExclusiveBuild } from "@/features/agentic/server/build-queue"
import { lastLine, type HostRunner } from "@/features/local-docker/server/shell"
import {
    adoptedRevisionCommand,
    cancelPorts,
    centralCheckoutCommand,
    cleanTreeCommand,
    configCommand,
    downCommand,
    envFileContent,
    envFileFromProject,
    forwardPorts,
    imagesExistCommand,
    logsCommand,
    packageVersionCommand,
    parseCommit,
    parsePackageVersion,
    registryImage,
    registryRepository,
    removeEnvFileCommand,
    removeGeneratedCommand,
    removeWorktreeCommand,
    restartCommand,
    startCommand,
    writeFileCommand,
    type ComposePlan,
} from "../commands"
import { overrideYaml, parseComposeConfig, runOnPcProblem, selectServices, type ComposeService } from "../compose-config"
import { DEPLOY_HEARTBEAT_MS, DEPLOY_LOG_MAX, ENVIRONMENTS_AUDIT_ENTITY, ENV_FILE, OVERRIDE_FILE } from "../constants"
import { executionSteps, type DeployStep } from "../pipeline"
import type { EnvironmentActionInput, EnvironmentsSettings, Machine } from "../schemas"
import type { DeployKind } from "../types"
import { emitDeploy, openDeployChannel } from "./hub"
import { Environment, EnvironmentDeploy, type DeployCheckpoint, type IEnvironment, type IEnvironmentDeploy } from "./models"
import { composePlanOf, envVarsOf, loadEnvironment } from "./service"
import { envLog, loadEnvironmentsSettings, machineAccess, publishEnvironment, runEnvHost, type MachineAccess } from "./settings"

/** Trava do build no PC (um por vez), por processo. */
const PC_LOCK_KEY = Symbol.for("opex.environments.pc-build")
const lockStore = globalThis as unknown as Record<symbol, Promise<void> | undefined>

async function withPcLock<T>(run: () => Promise<T>): Promise<T> {
    const previous = lockStore[PC_LOCK_KEY] ?? Promise.resolve()
    let release!: () => void
    lockStore[PC_LOCK_KEY] = new Promise<void>((resolve) => (release = resolve))
    try {
        await previous
        return await run()
    } finally {
        release()
    }
}

/** Ambientes com deploy em andamento neste processo (um por ambiente). */
const BUSY_KEY = Symbol.for("opex.environments.busy")
const busyStore = globalThis as unknown as Record<symbol, Set<string> | undefined>
const busy = () => (busyStore[BUSY_KEY] ??= new Set())

/** Id deste processo (dono dos deploys que ele conduz). */
const RUNNER_KEY = Symbol.for("opex.environments.runner-id")
const runnerStore = globalThis as unknown as Record<symbol, string | undefined>
export const runnerId = () => (runnerStore[RUNNER_KEY] ??= `${process.pid}-${randomBytes(4).toString("hex")}`)

class StepError extends Error {}

export const INTERRUPTED_BEFORE_EXECUTION = "O deploy foi interrompido antes de subir (o app reiniciou). Tente de novo."

interface DeployContext {
    deployId: string
    run: HostRunner
    write: (text: string) => void
}

async function runStep(ctx: DeployContext, step: Pick<DeployStep, "label" | "command" | "timeoutMs">, options: { redactedAs?: string; jobId?: string } = {}): Promise<string> {
    ctx.write(`\n\u001b[36m▸ ${step.label}\u001b[0m\n`)
    // Desacoplado do shell do OpenCode: o comando sobrevive ao OpenCode descartar o shell no meio.
    const result = await ctx.run(step.command, step.timeoutMs, { onOutput: ctx.write, redactedAs: options.redactedAs, detached: true, ...(options.jobId ? { jobId: options.jobId } : {}) })
    if (result.exitCode !== 0) throw new StepError(`${step.label} falhou (código ${result.exitCode ?? "?"})`)
    return result.output
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** Job do passo `index` da fase de execução: fixo, para um processo novo reencontrar o comando no host. */
export const executionJobId = (deployId: string, index: number) => `envdeploy-${deployId}-${index}`

interface RunStepsOptions {
    /** Primeiro passo (retomada). */
    start?: number
    /** Falha anterior à retomada (só os `always` seguem). */
    failure?: string | null
    /** Antes de cada passo: grava o ponto de retomada. */
    onStep?: (index: number, failure: string | null) => Promise<void>
    /** Ids fixos dos jobs (fase de execução). */
    jobIds?: (index: number) => string
}

/** Roda os passos; os `always` rodam mesmo depois de uma falha. */
async function runSteps(ctx: DeployContext, steps: DeployStep[], options: RunStepsOptions = {}): Promise<void> {
    let failure: unknown = options.failure ? new StepError(options.failure) : null
    for (let index = options.start ?? 0; index < steps.length; index++) {
        const step = steps[index]!
        if (failure && !step.always) continue
        await options.onStep?.(index, failure ? messageOf(failure) : null)
        if (step.note) ctx.write(`\n${step.note}\n`)
        try {
            const exec = () => runStep(ctx, step, { jobId: options.jobIds?.(index) })
            if (step.lock === "server") await runExclusiveBuild(exec)
            else if (step.lock === "pc") await withPcLock(exec)
            else await exec()
        } catch (error) {
            if (!failure) failure = error
        }
    }
    if (failure) throw failure
}

/**
 * Log e sinal de vida do deploy: cada pedaço vai ao hub (ao vivo) e, a cada `DEPLOY_HEARTBEAT_MS`, o
 * log e o `heartbeatAt` vão ao banco — se o app reiniciar no meio, outro processo vê o sinal vencido,
 * retoma o deploy e continua o log de onde parou.
 */
function deployRecorder(deployId: string, initialLog = "") {
    let log = initialLog
    let dirty = false
    let saving: Promise<unknown> = Promise.resolve()
    const persist = () => {
        const set: Record<string, unknown> = { heartbeatAt: new Date(), runnerId: runnerId() }
        if (dirty) set.log = clipLog(log)
        dirty = false
        saving = saving.then(() => EnvironmentDeploy.updateOne({ _id: deployId, status: "running" }, { $set: set })).catch((error: unknown) => envLog.warn({ err: error, deployId }, "[environments] Falha ao gravar o andamento do deploy"))
    }
    const timer = setInterval(persist, DEPLOY_HEARTBEAT_MS)
    timer.unref?.()
    return {
        write: (text: string) => {
            log += text
            dirty = true
            emitDeploy(deployId, { type: "log", text })
        },
        log: () => log,
        /** Para o sinal de vida (depois do fim do deploy). */
        stop: async () => {
            clearInterval(timer)
            await saving
        },
    }
}

const clipLog = (log: string) => (log.length > DEPLOY_LOG_MAX ? log.slice(-DEPLOY_LOG_MAX) : log)

/** Versão do `package.json` da pasta do ambiente (falha só vira `null`). */
async function readVersion(ctx: DeployContext, plan: ComposePlan): Promise<string | null> {
    const result = await ctx.run(packageVersionCommand(plan), 30_000, { retryOnLost: true }).catch(() => null)
    const version = result?.exitCode === 0 ? parsePackageVersion(result.output) : null
    if (version) ctx.write(`\nVersão do app: v${version}\n`)
    return version
}

/** Busca/atualiza o código e devolve o commit (`null` = pasta sem git). */
async function prepareSource(ctx: DeployContext, env: IEnvironment, settings: EnvironmentsSettings, plan: ComposePlan, ref: string | null, kind: DeployKind): Promise<string | null> {
    const source = env.source
    if (source.kind === "central") {
        const { config } = await loadCentral(source.centralId)
        const output = await runStep(ctx, { label: `Código da ref ${ref ?? source.ref}`, command: centralCheckoutCommand(settings, config.sessionDirectory, env.slug, ref ?? source.ref), timeoutMs: 300_000 })
        return parseCommit(output)
    }
    if (!source.git) {
        ctx.write("\nPasta sem git: o redeploy só refaz o build.\n")
        return null
    }
    const output = await runStep(ctx, { label: source.pullOnRedeploy && kind === "deploy" ? "git pull" : "Commit atual", command: adoptedRevisionCommand(plan, source.pullOnRedeploy && kind === "deploy"), timeoutMs: 300_000 })
    return parseCommit(output)
}

/** `.env.opex`, `config` do compose, bloqueio de executar no PC e o override com as imagens. */
async function prepareCompose(ctx: DeployContext, env: IEnvironment, settings: EnvironmentsSettings, plan: ComposePlan, access: MachineAccess, target: { buildOn: Machine; runOn: Machine }, tag: string): Promise<ComposeService[]> {
    const vars = envVarsOf(env)
    if (vars.length) {
        await runStep(ctx, { label: "Variáveis extras", command: writeFileCommand(plan, ENV_FILE, envFileContent(vars)), timeoutMs: 30_000 }, { redactedAs: `gravar ${ENV_FILE} (${vars.length} variável(is), valores ocultos)` })
    } else {
        // O compose usa o `.env.opex` sempre que ele existe: o do deploy anterior não pode continuar valendo.
        await runStep(ctx, { label: "Sem variáveis extras", command: removeEnvFileCommand(plan), timeoutMs: 30_000 })
    }
    // O override entra em todo comando do compose: grava um vazio antes do `config`.
    await runStep(ctx, { label: "Override (inicial)", command: writeFileCommand(plan, OVERRIDE_FILE, overrideYaml({ services: [], images: {}, withEnvFile: false })), timeoutMs: 30_000 })
    // A saída do `config` traz as variáveis já resolvidas (segredos): nunca vai para o log.
    ctx.write(`\n\u001b[36m▸ Lendo o compose\u001b[0m\n`)
    const read = await ctx.run(configCommand(plan, access.targets.server), 60_000, { detached: true, redactedAs: "docker compose config (saída omitida: contém as variáveis)" })
    if (read.exitCode !== 0) throw new StepError(`Lendo o compose falhou (código ${read.exitCode ?? "?"})${configError(read.output)}`)
    const parsed = parseComposeConfig(read.output)
    if (!parsed) throw new StepError("Não foi possível ler o docker compose config")
    const services = selectServices(parsed, plan.services)
    if (!services.length) throw new StepError("Nenhum serviço do compose para implantar")
    ctx.write(`Compose lido: ${services.length} serviço(s): ${services.map((service) => service.name).join(", ")}\n`)
    if (target.runOn === "pc" && plan.filesOn === "server") {
        const problem = runOnPcProblem(services)
        if (problem) throw new StepError(problem)
    }
    const cross = target.buildOn !== target.runOn
    const images = cross ? Object.fromEntries(services.filter((service) => service.hasBuild).map((service) => [service.name, registryImage(settings, env.slug, service.name, tag)])) : {}
    await runStep(ctx, { label: "Override do opex", command: writeFileCommand(plan, OVERRIDE_FILE, overrideYaml({ services, images, withEnvFile: vars.length > 0, envFilePath: envFileFromProject(plan) })), timeoutMs: 30_000 })
    return services
}

/** Fim da saída de erro do `config` (sem JSON: nunca as variáveis resolvidas). */
function configError(output: string): string {
    if (output.trimStart().startsWith("{")) return ""
    const line = lastLine(output)
    return line ? `: ${line.slice(0, 300)}` : ""
}

/**
 * Build e execução em máquinas diferentes com tag de commit: se todas as imagens do commit já existem
 * na máquina do build (deploy anterior falhou depois do build), o build é reaproveitado.
 */
async function canReuseBuild(ctx: DeployContext, env: IEnvironment, settings: EnvironmentsSettings, plan: ComposePlan, access: MachineAccess, target: { buildOn: Machine; runOn: Machine }, commit: string | null, buildServices: string[]): Promise<boolean> {
    if (!commit || target.buildOn === target.runOn || !buildServices.length) return false
    // Projeto adotado é a árvore de trabalho do usuário: com alterações não commitadas o HEAD não
    // descreve o código, então o build é refeito (a central usa um worktree limpo na ref).
    if (env.source.kind === "adopted") {
        const tree = await ctx.run(cleanTreeCommand(plan), 60_000, { retryOnLost: true }).catch(() => null)
        if (tree?.exitCode !== 0 || tree.output.trim() !== "clean") {
            ctx.write("\nHá alterações não commitadas na pasta: o build é refeito.\n")
            return false
        }
    }
    const images = buildServices.map((service) => registryImage(settings, env.slug, service, commit))
    const result = await ctx.run(imagesExistCommand(plan, access.targets[target.buildOn], images), 60_000, { retryOnLost: true }).catch(() => null)
    return result?.exitCode === 0 && result.output.includes("present")
}

interface StartDeployInput {
    kind: DeployKind
    ref?: string | null
    /** Mover: novas máquinas, gravadas só depois de o deploy ser aceito (ambiente livre e PC alcançável). */
    placement?: { buildOn: Machine; runOn: Machine }
    run?: HostRunner
    /** Espera o fim (testes); padrão: roda em segundo plano. */
    wait?: boolean
    /** Sessão do Agente Opex avisada quando o deploy terminar. */
    notifyOpexSessionId?: string | null
}

/** Começa um deploy (ou mover) em segundo plano e devolve o id do registro (log ao vivo nas events). */
export async function startDeploy(id: string, actorId: string, input: StartDeployInput): Promise<string> {
    const saved = await loadEnvironment(id)
    if (busy().has(id)) throw new DomainError(409, "Já há um deploy deste ambiente em andamento", "ENVIRONMENT_BUSY")
    const env: IEnvironment = input.placement ? { ...saved, ...input.placement } : saved
    const run = input.run ?? runEnvHost
    const access = await machineAccess(run)
    if ((env.buildOn === "pc" || env.runOn === "pc") && !access.pcAvailable) throw new DomainError(409, access.pcReason ?? "O PC não está disponível", "ENVIRONMENT_PC_UNAVAILABLE")
    if (busy().has(id)) throw new DomainError(409, "Já há um deploy deste ambiente em andamento", "ENVIRONMENT_BUSY")
    busy().add(id)
    const ref = input.ref || null
    let deployId: string
    try {
        if (input.placement) await Environment.updateOne({ _id: id }, { $set: { ...input.placement, updatedAt: new Date() } })
        const deploy = await EnvironmentDeploy.create({ environmentId: id, kind: input.kind, status: "running", ref: ref ?? (env.source.kind === "central" ? env.source.ref : null), buildOn: env.buildOn, runOn: env.runOn, startedAt: new Date(), heartbeatAt: new Date(), runnerId: runnerId(), notifyOpexSessionId: input.notifyOpexSessionId ?? null })
        deployId = String(deploy._id)
        await Environment.updateOne({ _id: id }, { $set: { lastDeployId: deployId } })
        await recordAudit({ userId: actorId, entidade: ENVIRONMENTS_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, depois: { acao: input.kind, ref: deploy.ref, buildEm: env.buildOn, executarEm: env.runOn } })
        openDeployChannel(deployId)
        await publishEnvironment(id, "deploy")
    } catch (error) {
        busy().delete(id)
        throw error
    }
    const job = executeDeploy(env, deployId, ref, input.kind, access, run).finally(() => busy().delete(id))
    if (input.wait) await job
    else void job
    return deployId
}

const machineName = (machine: Machine) => (machine === "pc" ? "PC" : "servidor")

async function executeDeploy(env: IEnvironment, deployId: string, ref: string | null, kind: DeployKind, access: MachineAccess, run: HostRunner): Promise<void> {
    const recorder = deployRecorder(deployId)
    const ctx: DeployContext = { deployId, run, write: recorder.write }
    const target = { buildOn: env.buildOn, runOn: env.runOn }
    let commit: string | null = null
    let tag: string | null = null
    try {
        const settings = await loadEnvironmentsSettings()
        const plan = composePlanOf(env, settings)
        ctx.write(`Deploy de ${env.name}: build no ${machineName(target.buildOn)}, execução no ${machineName(target.runOn)}.\n`)
        commit = await prepareSource(ctx, env, settings, plan, ref, kind)
        tag = commit ?? `t${Date.now()}`
        const version = await readVersion(ctx, plan)
        const services = await prepareCompose(ctx, env, settings, plan, access, target, tag)
        const buildServices = services.filter((service) => service.hasBuild).map((service) => service.name)
        if (target.buildOn !== target.runOn && buildServices.length) {
            await EnvironmentDeploy.updateOne({ _id: deployId }, { $set: { repositories: buildServices.map((service) => registryRepository(env.slug, service)) } })
        }
        const skipBuild = await canReuseBuild(ctx, env, settings, plan, access, target, commit, buildServices)
        if (skipBuild) ctx.write(`\nBuild reaproveitado: as imagens do commit ${commit} já existem no ${machineName(target.buildOn)}.\n`)
        // Daqui em diante o deploy pode ser retomado por outro processo (ex.: o redeploy do próprio app).
        const checkpoint: DeployCheckpoint = { step: 0, failure: null, ref, commit, tag, version, buildServices, skipBuild, from: env.deployedOn?.runOn ?? null }
        await EnvironmentDeploy.updateOne({ _id: deployId }, { $set: { checkpoint, version, skipBuild } })
        await runExecution(ctx, env, settings, plan, access, checkpoint)
        await completeDeploy(env, deployId, recorder, checkpoint)
    } catch (error) {
        await failDeploy(String(env._id), deployId, recorder, error, commit, tag)
    } finally {
        await recorder.stop()
        await publishEnvironment(String(env._id), "deploy")
    }
}

/** Fase de execução (`executionSteps`) a partir do passo do ponto de retomada, que avança a cada passo. */
async function runExecution(ctx: DeployContext, env: IEnvironment, settings: EnvironmentsSettings, plan: ComposePlan, access: MachineAccess, checkpoint: DeployCheckpoint): Promise<void> {
    const steps = executionSteps({ settings, plan, buildOn: env.buildOn, runOn: env.runOn, targets: access.targets, buildServices: checkpoint.buildServices, ports: env.ports, healthUrl: env.healthUrl, skipBuild: checkpoint.skipBuild, from: checkpoint.from, down: downCommand })
    await runSteps(ctx, steps, {
        start: checkpoint.step,
        failure: checkpoint.failure,
        jobIds: (index) => executionJobId(ctx.deployId, index),
        onStep: async (index, failure) => {
            await EnvironmentDeploy.updateOne({ _id: ctx.deployId }, { $set: { "checkpoint.step": index, "checkpoint.failure": failure } })
        },
    })
}

type Recorder = ReturnType<typeof deployRecorder>

async function completeDeploy(env: IEnvironment, deployId: string, recorder: Recorder, checkpoint: DeployCheckpoint): Promise<void> {
    const target = { buildOn: env.buildOn, runOn: env.runOn }
    await Environment.updateOne({ _id: env._id }, { $set: { deployedOn: target, deployedRef: checkpoint.ref ?? (env.source.kind === "central" ? env.source.ref : null), deployedCommit: checkpoint.commit, deployedVersion: checkpoint.version, updatedAt: new Date() } })
    await finishDeploy(deployId, "success", null, recorder.log(), checkpoint.commit, checkpoint.tag)
    envLog.info({ id: String(env._id), deployId, ...target }, "[environments] Deploy concluído")
}

async function failDeploy(envId: string, deployId: string, recorder: Recorder, error: unknown, commit: string | null, tag: string | null): Promise<void> {
    const message = messageOf(error)
    recorder.write(`\n\u001b[31m✖ ${message}\u001b[0m\n`)
    await finishDeploy(deployId, "failed", message, recorder.log(), commit, tag)
    envLog.warn({ err: error, id: envId, deployId }, "[environments] Deploy falhou")
}

async function finishDeploy(deployId: string, status: "success" | "failed", error: string | null, log: string, commit: string | null, tag: string | null): Promise<void> {
    await EnvironmentDeploy.updateOne({ _id: deployId }, { $set: { status, error, log: clipLog(log), commit, imageTag: tag, finishedAt: new Date(), checkpoint: null } })
    emitDeploy(deployId, { type: "status", status, error })
    await notifyOpexIfAsked(deployId)
}

/** Deploy pedido pelo Agente Opex: o resultado entra sozinho na sessão (falha só vai para o log). */
async function notifyOpexIfAsked(deployId: string): Promise<void> {
    try {
        const deploy = await EnvironmentDeploy.findById(deployId).select({ log: 0 }).lean<IEnvironmentDeploy>()
        if (!deploy?.notifyOpexSessionId) return
        const { notifyOpexDeployFinished } = await import("./opex-notice")
        await notifyOpexDeployFinished(deploy)
    } catch (error) {
        envLog.warn({ err: error instanceof Error ? error.message : error, deployId }, "[environments] Falha ao avisar o Agente Opex do fim do deploy")
    }
}

/**
 * Retoma um deploy cujo processo morreu (sinal de vida vencido), já reivindicado por este processo:
 * com o ponto de retomada, reencontra o job do passo em andamento no host (id fixo) e segue até o fim;
 * sem ele (o app reiniciou antes da fase de execução), encerra como falha. Nunca fica em andamento.
 */
export async function resumeDeploy(deploy: IEnvironmentDeploy, run: HostRunner = runEnvHost): Promise<void> {
    const deployId = String(deploy._id)
    const envId = deploy.environmentId
    openDeployChannel(deployId, deploy.log ?? "")
    const recorder = deployRecorder(deployId, deploy.log ?? "")
    const ctx: DeployContext = { deployId, run, write: recorder.write }
    const checkpoint = deploy.checkpoint ?? null
    busy().add(envId)
    try {
        if (!checkpoint) throw new StepError(INTERRUPTED_BEFORE_EXECUTION)
        const saved = await loadEnvironment(envId)
        const env: IEnvironment = { ...saved, buildOn: deploy.buildOn, runOn: deploy.runOn }
        const access = await machineAccess(run)
        if ((env.buildOn === "pc" || env.runOn === "pc") && !access.pcAvailable) throw new StepError(`Não foi possível retomar o deploy depois de o app reiniciar: ${access.pcReason ?? "o PC não está disponível"}`)
        const settings = await loadEnvironmentsSettings()
        ctx.write(`\n\u001b[33m↻ O app reiniciou durante o deploy: retomando no passo ${checkpoint.step + 1}.\u001b[0m\n`)
        envLog.info({ id: envId, deployId, step: checkpoint.step }, "[environments] Retomando deploy interrompido")
        await runExecution(ctx, env, settings, composePlanOf(env, settings), access, checkpoint)
        await completeDeploy(env, deployId, recorder, checkpoint)
    } catch (error) {
        await failDeploy(envId, deployId, recorder, error, checkpoint?.commit ?? deploy.commit, checkpoint?.tag ?? deploy.imageTag)
    } finally {
        busy().delete(envId)
        await recorder.stop()
        await publishEnvironment(envId, "deploy")
    }
}

/** Ações de efeito imediato (levantar/derrubar/reiniciar/logs) e o mover. */
export async function runEnvironmentAction(id: string, input: EnvironmentActionInput, actorId: string, run: HostRunner = runEnvHost, options: { notifyOpexSessionId?: string | null } = {}): Promise<{ deployId: string | null; output: string | null }> {
    const notifyOpexSessionId = options.notifyOpexSessionId ?? null
    if (input.action === "deploy") return { deployId: await startDeploy(id, actorId, { kind: "deploy", ref: input.ref ?? null, run, notifyOpexSessionId }), output: null }
    if (input.action === "move") {
        const env = await loadEnvironment(id)
        if (env.source.kind === "adopted" && env.source.machine === "pc" && (input.buildOn !== "pc" || input.runOn !== "pc")) throw new DomainError(422, "Projeto adotado do PC: os arquivos estão no PC, então o build e a execução ficam no PC.", "ENVIRONMENT_INVALID_PLACEMENT")
        return { deployId: await startDeploy(id, actorId, { kind: "move", placement: { buildOn: input.buildOn, runOn: input.runOn }, run, notifyOpexSessionId }), output: null }
    }
    const env = await loadEnvironment(id)
    if (busy().has(id)) throw new DomainError(409, "Há um deploy deste ambiente em andamento", "ENVIRONMENT_BUSY")
    const on = env.deployedOn?.runOn ?? env.runOn
    const access = await machineAccess(run)
    if (on === "pc" && !access.pcAvailable) throw new DomainError(409, access.pcReason ?? "O PC não está disponível", "ENVIRONMENT_PC_UNAVAILABLE")
    const plan = composePlanOf(env, await loadEnvironmentsSettings())
    const target = access.targets[on]
    const commands: Record<Exclude<EnvironmentActionInput["action"], "deploy" | "move">, string> = {
        up: on === "pc" && env.ports.length ? `${startCommand(plan, target)} && ${forwardPorts(env.ports)}` : startCommand(plan, target),
        down: on === "pc" && env.ports.length ? `${downCommand(plan, target)}; ${cancelPorts(env.ports)}` : downCommand(plan, target),
        restart: restartCommand(plan, target),
        logs: logsCommand(plan, target),
    }
    const result = await run(commands[input.action], 300_000, input.action === "logs" ? { retryOnLost: true } : { detached: true })
    if (input.action !== "logs") {
        if (result.exitCode !== 0) throw new DomainError(502, `Não foi possível ${input.action === "up" ? "levantar" : input.action === "down" ? "derrubar" : "reiniciar"} o ambiente: ${result.output.split("\n").pop() ?? ""}`, "ENVIRONMENT_ACTION_FAILED")
        await recordAudit({ userId: actorId, entidade: ENVIRONMENTS_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, depois: { acao: input.action, maquina: on } })
        await publishEnvironment(id, "status")
    }
    return { deployId: null, output: input.action === "logs" ? result.output : null }
}

/** Apaga: derruba onde estiver (volumes opcionais), limpa a pasta gerada e o registro. */
export async function deleteEnvironment(id: string, options: { volumes: boolean }, actorId: string, run: HostRunner = runEnvHost): Promise<void> {
    const env = await loadEnvironment(id)
    if (busy().has(id)) throw new DomainError(409, "Há um deploy deste ambiente em andamento", "ENVIRONMENT_BUSY")
    const settings = await loadEnvironmentsSettings()
    const plan = composePlanOf(env, settings)
    if (env.deployedOn) {
        const access = await machineAccess(run)
        const on = env.deployedOn.runOn
        if (on === "pc" && !access.pcAvailable) throw new DomainError(409, `${access.pcReason ?? "O PC não está disponível"} (o ambiente está no PC)`, "ENVIRONMENT_PC_UNAVAILABLE")
        const down = await run(`${downCommand(plan, access.targets[on], options.volumes)}${on === "pc" && env.ports.length ? `; ${cancelPorts(env.ports)}` : ""}`, 300_000, { detached: true })
        if (down.exitCode !== 0) throw new DomainError(502, `Não foi possível derrubar o ambiente: ${down.output.split("\n").pop() ?? ""}`, "ENVIRONMENT_ACTION_FAILED")
    }
    if (env.source.kind === "central") {
        const { config } = await loadCentral(env.source.centralId).catch(() => ({ config: null }))
        if (config) await run(removeWorktreeCommand(settings, config.sessionDirectory, env.slug), 120_000)
    } else {
        await run(removeGeneratedCommand(plan), 30_000)
    }
    await Environment.deleteOne({ _id: id })
    await EnvironmentDeploy.deleteMany({ environmentId: id })
    await recordAudit({ userId: actorId, entidade: ENVIRONMENTS_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.EXCLUIR, antes: { nome: env.name, slug: env.slug, projeto: env.source.projectName }, depois: { volumesApagados: options.volumes } })
    envLog.info({ id, slug: env.slug }, "[environments] Ambiente apagado")
    await publishEnvironment(id, "deleted", { centralId: env.source.kind === "central" ? env.source.centralId : null })
}
