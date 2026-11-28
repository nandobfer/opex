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
    ensureEnvDirCommand,
    envFileContent,
    envFileFromProject,
    forwardPorts,
    imagesExistCommand,
    logsCommand,
    overrideCheckCommand,
    packageVersionCommand,
    parseCommit,
    parsePackageVersion,
    registryImage,
    registryRepository,
    removeEnvDirCommand,
    removeEnvFileCommand,
    removeGeneratedCommand,
    removeWorktreeCommand,
    restartCommand,
    bootstrapDeployedFilesCommand,
    dropDeployedFilesCommand,
    promoteDeployedFilesCommand,
    restoreDeployedFilesCommand,
    stageDeployedFilesCommand,
    startCommand,
    writeFileCommand,
    type ComposePlan,
} from "../commands"
import { overrideYaml, parseComposeConfig, runOnPcProblem, selectServices, withOverrideMounts, type ComposeService } from "../compose-config"
import { HIDDEN_VALUE } from "../opex-format"
import { overrideYamlKeys, overrideYamlServices } from "../override-yaml"
import { composeOverridesOf, customizedFields, overrideServiceNames, ownImageServices, serviceOverrideText } from "../service-overrides"
import { DEPLOY_HEARTBEAT_MS, DEPLOY_LOG_MAX, ENVIRONMENTS_AUDIT_ENTITY, ENV_FILE, MANAGED_COMPOSE_FILE, OVERRIDE_FILE } from "../constants"
import { executionSteps, type DeployStep } from "../pipeline"
import { environmentLimitsOf, limitsForService, limitsText, unknownLimitServices, type ResourceLimits } from "../resource-limits"
import type { ComposeOverrides, EnvironmentActionInput, EnvironmentLimits, EnvironmentsSettings, Machine } from "../schemas"
import type { DeployKind } from "../types"
import { emitDeploy, openDeployChannel } from "./hub"
import { Environment, EnvironmentDeploy, type DeployCheckpoint, type IEnvironment, type IEnvironmentDeploy } from "./models"
import { currentComposeRevision, deleteComposeRevisions, markComposeDeployed } from "./compose-revisions"
import { ensureComposeEnvFiles } from "./env-files"
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

/** Compose gerenciado com `build`: não há código-fonte na pasta (fora do escopo da OPE-191). */
export const MANAGED_BUILD_UNSUPPORTED = "Compose gerenciado não tem código-fonte: use `image:` nos serviços ou a origem central"
export const MANAGED_COMPOSE_MISSING = "O ambiente não tem compose: escreva-o em Compose e implante de novo"

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
    if (source.kind === "managed") {
        await runStep(ctx, { label: "Pasta do ambiente", command: ensureEnvDirCommand(settings, env.slug), timeoutMs: 30_000 })
        ctx.write("\nCompose gerenciado: sem código-fonte nem git.\n")
        return null
    }
    if (!source.git) {
        ctx.write("\nPasta sem git: o redeploy só refaz o build.\n")
        return null
    }
    const output = await runStep(ctx, { label: source.pullOnRedeploy && kind === "deploy" ? "git pull" : "Commit atual", command: adoptedRevisionCommand(plan, source.pullOnRedeploy && kind === "deploy"), timeoutMs: 300_000 })
    return parseCommit(output)
}

/**
 * `.env.opex`, arquivos de variáveis do compose, `config`, bloqueio de executar no PC e o override com
 * as imagens. Devolve os serviços e os arquivos de variáveis que o compose declara.
 */
async function prepareCompose(ctx: DeployContext, env: IEnvironment, settings: EnvironmentsSettings, plan: ComposePlan, access: MachineAccess, target: { buildOn: Machine; runOn: Machine }, tag: string): Promise<{ services: ComposeService[]; envFiles: string[]; composeVersion: number | null; ownImages: string[] }> {
    const overrides = composeOverridesOf(env.composeOverrides)
    // Ambiente implantado antes da cópia do último deploy existir: a cópia sai dos arquivos de agora, antes de regravá-los.
    if (env.deployedOn && env.deployedOn.buildOn === target.buildOn && env.deployedOn.runOn === target.runOn) {
        await runStep(ctx, { label: "Cópia do último deploy", command: bootstrapDeployedFilesCommand(plan, String(env._id)), timeoutMs: 30_000 }, { redactedAs: `guardar ${OVERRIDE_FILE} e ${ENV_FILE} do último deploy (se ainda não guardados)` })
    }
    const ownImages = ownImageServices(overrides)
    const composeVersion = env.source.kind === "managed" ? await writeManagedCompose(ctx, env, plan) : null
    const vars = envVarsOf(env)
    if (vars.length) {
        await runStep(ctx, { label: "Variáveis extras", command: writeFileCommand(plan, ENV_FILE, envFileContent(vars)), timeoutMs: 30_000 }, { redactedAs: `gravar ${ENV_FILE} (${vars.length} variável(is), valores ocultos)` })
    } else {
        // O compose usa o `.env.opex` sempre que ele existe: o do deploy anterior não pode continuar valendo.
        await runStep(ctx, { label: "Sem variáveis extras", command: removeEnvFileCommand(plan), timeoutMs: 30_000 })
    }
    // O override entra em todo comando do compose: grava um vazio antes do `config`.
    await runStep(ctx, { label: "Override (inicial)", command: writeFileCommand(plan, OVERRIDE_FILE, overrideYaml({ services: [], images: {}, withEnvFile: false })), timeoutMs: 30_000 })
    // Arquivo de variáveis declarado pelo compose e ausente na pasta (ex.: o 1º deploy) é criado vazio.
    const envFiles = await ensureComposeEnvFiles(plan, access.targets.server, ctx.run, { write: ctx.write })
    // A saída do `config` traz as variáveis já resolvidas (segredos): nunca vai para o log.
    ctx.write(`\n\u001b[36m▸ Lendo o compose\u001b[0m\n`)
    const read = await ctx.run(configCommand(plan, access.targets.server), 60_000, { detached: true, redactedAs: "docker compose config (saída omitida: contém as variáveis)" })
    if (read.exitCode !== 0) throw new StepError(`Lendo o compose falhou (código ${read.exitCode ?? "?"})${configError(read.output)}`)
    const parsed = parseComposeConfig(read.output)
    if (!parsed) throw new StepError("Não foi possível ler o docker compose config")
    const services = selectServices(parsed, plan.services)
    if (!services.length) throw new StepError("Nenhum serviço do compose para implantar")
    const names = services.map((service) => service.name).join(", ")
    if (composeVersion !== null) {
        // Antes de qualquer build: o compose gerenciado não tem código-fonte na pasta.
        if (services.some((service) => service.hasBuild && !ownImages.includes(service.name))) throw new StepError(MANAGED_BUILD_UNSUPPORTED)
        ctx.write(`Compose gerenciado v${composeVersion} (${services.length} serviço(s)): ${names}\n`)
    } else ctx.write(`Compose lido: ${services.length} serviço(s): ${names}\n`)
    if (target.runOn === "pc" && plan.filesOn === "server") {
        const problem = runOnPcProblem(withOverrideMounts(services, overrides))
        if (problem) throw new StepError(problem)
    }
    const cross = target.buildOn !== target.runOn
    const images = cross ? Object.fromEntries(services.filter((service) => service.hasBuild && !ownImages.includes(service.name)).map((service) => [service.name, registryImage(settings, env.slug, service.name, tag)])) : {}
    const limits = deployLimits(ctx, environmentLimitsOf(env.limits), services)
    deployOverrides(ctx, overrides, services)
    const overrideInput = { services, images, withEnvFile: vars.length > 0, envFilePath: envFileFromProject(plan), limits }
    await runStep(ctx, { label: "Override do opex", command: writeFileCommand(plan, OVERRIDE_FILE, overrideYaml({ ...overrideInput, overrides })), timeoutMs: 30_000 }, { redactedAs: `gravar ${OVERRIDE_FILE} (conteúdo omitido)` })
    // Antes de qualquer build: YAML avançado ruim ou um Compose sem `!reset`/`!override` (< 2.24.4) falham aqui.
    if (overrideServiceNames(overrides).length) await checkOverride(ctx, plan, access, overrides, overrideYaml({ ...overrideInput, overrides: null }))
    return { services, envFiles, composeVersion, ownImages }
}

/**
 * Progresso da execução: `upStarted` = o passo que sobe os containers começou; `upDone` = ele terminou sem erro (o
 * passo seguinte começou sem falha). Começado e não terminado = estado dos containers indeterminado.
 */
interface ExecutionProgress {
    upStarted: boolean
    upDone: boolean
}

const newProgress = (): ExecutionProgress => ({ upStarted: false, upDone: false })

/**
 * A cópia `pending` (os arquivos deste deploy) vira a do último deploy. Nunca derruba o deploy: os containers já
 * estão com esta configuração. Se não der para guardar, as cópias saem (a próxima falha não volta arquivos de outro
 * deploy) e o log avisa a condição.
 */
async function promoteDeployedFiles(ctx: DeployContext, plan: ComposePlan, environmentId: string): Promise<void> {
    try {
        const result = await ctx.run(promoteDeployedFilesCommand(plan, environmentId), 30_000, { redactedAs: `guardar ${OVERRIDE_FILE} e ${ENV_FILE} deste deploy` })
        if (result.exitCode === 0) return
    } catch (error) {
        envLog.warn({ deployId: ctx.deployId, err: error instanceof Error ? error.message : String(error) }, "[environments] Não foi possível guardar a cópia dos arquivos do deploy")
    }
    await ctx.run(dropDeployedFilesCommand(plan, environmentId), 30_000).catch(() => undefined)
    ctx.write(`\n\u001b[33mNão foi possível guardar a cópia do override e das variáveis extras deste deploy: os containers e os arquivos da pasta seguem com esta configuração, mas uma falha no próximo deploy não vai voltar os arquivos.\u001b[0m\n`)
}

/**
 * Deploy que falhou antes de subir os containers: o override e o `.env.opex` voltam aos do último deploy
 * concluído, para Levantar, Reiniciar e Derrubar seguirem com a configuração implantada. Falhar aqui só avisa.
 */
async function restoreDeployedFiles(ctx: DeployContext, plan: ComposePlan, environmentId: string): Promise<void> {
    try {
        const result = await ctx.run(restoreDeployedFilesCommand(plan, environmentId), 30_000, { redactedAs: `voltar ${OVERRIDE_FILE} e ${ENV_FILE} aos do último deploy` })
        if (result.exitCode === 0 && result.output.includes("restored")) ctx.write(`\nOverride e variáveis extras voltaram aos do último deploy concluído.\n`)
    } catch (error) {
        envLog.warn({ deployId: ctx.deployId, err: error instanceof Error ? error.message : String(error) }, "[environments] Não foi possível voltar os arquivos do último deploy")
    }
}

/** Textos dos ajustes que podem ser segredo (valores do environment, dos labels e do YAML avançado). */
function overrideSecrets(overrides: ComposeOverrides): string[] {
    const values = overrides.services.flatMap((item) => [...(item.environment ?? []), ...(item.labels ?? [])].map((entry) => entry.value))
    const collect = (node: unknown): void => {
        if (typeof node === "string") values.push(node)
        else if (Array.isArray(node)) node.forEach(collect)
        else if (node && typeof node === "object") Object.values(node).forEach(collect)
    }
    for (const node of overrideYamlServices(overrides.yaml).values()) collect(node.toJSON())
    return [...new Set(values.map((value) => value.trim()).filter((value) => value.length >= 3))].sort((a, b) => b.length - a.length)
}

/**
 * Confere o override gravado (`config --quiet`). A saída nunca vai para o log (o erro do compose pode citar um
 * valor): só a última linha, com os valores dos ajustes ocultos. Na falha, o override volta a ser o sem ajustes
 * (válido): Reiniciar, Derrubar e Levantar não ficam presos a um override quebrado.
 */
async function checkOverride(ctx: DeployContext, plan: ComposePlan, access: MachineAccess, overrides: ComposeOverrides, safeOverride: string): Promise<void> {
    ctx.write(`\n\u001b[36m▸ Conferindo o override\u001b[0m\n`)
    const result = await ctx.run(overrideCheckCommand(plan, access.targets.server), 60_000, { detached: true, redactedAs: "docker compose config --quiet (conferir o override; saída omitida)" })
    if (result.exitCode === 0) return
    let detail = configError(result.output)
    for (const secret of overrideSecrets(overrides)) detail = detail.split(secret).join(HIDDEN_VALUE)
    await runStep(ctx, { label: "Override sem os ajustes (a conferência falhou)", command: writeFileCommand(plan, OVERRIDE_FILE, safeOverride), timeoutMs: 30_000 }, { redactedAs: `gravar ${OVERRIDE_FILE} (sem os ajustes dos serviços)` })
    throw new StepError(`Conferindo o override falhou (código ${result.exitCode ?? "?"})${detail}. Revise os ajustes dos serviços (ou o YAML avançado); o Docker Compose precisa ser 2.24.4 ou mais novo.`)
}

/**
 * Grava a revisão vigente do compose gerenciado na pasta do ambiente e a registra no deploy. O conteúdo
 * nunca vai para o log: o debug mostra só o nome e a versão.
 */
async function writeManagedCompose(ctx: DeployContext, env: IEnvironment, plan: ComposePlan): Promise<number> {
    const revision = await currentComposeRevision(String(env._id))
    if (!revision) throw new StepError(MANAGED_COMPOSE_MISSING)
    await runStep(ctx, { label: `Compose gerenciado v${revision.version}`, command: writeFileCommand(plan, MANAGED_COMPOSE_FILE, revision.content), timeoutMs: 30_000 }, { redactedAs: `gravar ${MANAGED_COMPOSE_FILE} (compose gerenciado v${revision.version}, conteúdo omitido)` })
    await EnvironmentDeploy.updateOne({ _id: ctx.deployId }, { $set: { composeVersion: revision.version } })
    return revision.version
}

/**
 * Limites de cada serviço para o override e as linhas do log: os limites (ou "sem limite") e as linhas do
 * modo por serviço que não existem no compose (ignoradas, sem bloquear o deploy).
 */
export function deployLimits(ctx: Pick<DeployContext, "write">, limits: EnvironmentLimits, services: ComposeService[]): Record<string, ResourceLimits | null> {
    const byService = Object.fromEntries(services.map((service) => [service.name, limitsForService(limits, service.name)]))
    const configured = Object.values(byService).some(Boolean)
    for (const service of unknownLimitServices(limits, services.map((item) => item.name))) ctx.write(`\u001b[33mLimite do serviço ${service} ignorado: o serviço não está no compose.\u001b[0m\n`)
    if (configured) ctx.write(`Limites: ${services.map((service) => `${service.name} ${byService[service.name] ? limitsText(byService[service.name]!) : "sem limite"}`).join("; ")}\n`)
    return byService
}

/**
 * Log dos ajustes dos serviços (OPE-211): por serviço (do `environment`, só as chaves), os serviços do YAML
 * avançado e os que não estão no compose (ignorados, sem bloquear o deploy).
 */
export function deployOverrides(ctx: Pick<DeployContext, "write">, overrides: ComposeOverrides, services: ComposeService[]): void {
    const names = services.map((service) => service.name)
    for (const service of overrideServiceNames(overrides).filter((name) => !names.includes(name))) ctx.write(`\u001b[33mAjustes do serviço ${service} ignorados: o serviço não está no compose.\u001b[0m\n`)
    const guided = overrides.services.filter((item) => names.includes(item.service) && customizedFields(item).length).map((item) => `${item.service} ${serviceOverrideText(item)}`)
    if (guided.length) ctx.write(`Serviços: ${guided.join("; ")}\n`)
    const yaml = Object.keys(overrideYamlKeys(overrides.yaml)).filter((name) => names.includes(name))
    if (yaml.length) ctx.write(`YAML avançado: serviços ${yaml.join(", ")}\n`)
}

/** Fim da saída de erro do `config` (sem JSON: nunca as variáveis resolvidas). */
export function configError(output: string): string {
    if (output.trimStart().startsWith("{")) return ""
    const line = lastLine(output)
    const missing = /required variable ([A-Za-z_][A-Za-z0-9_]*) is missing a value/.exec(output)?.[1]
    const hint = missing ? `. A variável ${missing} não veio das Variáveis extras nem do arquivo de variáveis: cadastre-a em Variáveis extras.` : ""
    return line ? `: ${line.slice(0, 300)}${hint}` : hint
}

/**
 * Build e execução em máquinas diferentes com tag de commit: se todas as imagens do commit já existem
 * na máquina do build (deploy anterior falhou depois do build), o build é reaproveitado.
 */
async function canReuseBuild(ctx: DeployContext, env: IEnvironment, settings: EnvironmentsSettings, plan: ComposePlan, access: MachineAccess, target: { buildOn: Machine; runOn: Machine }, commit: string | null, buildServices: string[], envFiles: string[]): Promise<boolean> {
    if (!commit || target.buildOn === target.runOn || !buildServices.length) return false
    // Projeto adotado é a árvore de trabalho do usuário: com alterações não commitadas o HEAD não
    // descreve o código, então o build é refeito (a central usa um worktree limpo na ref).
    if (env.source.kind === "adopted") {
        const tree = await ctx.run(cleanTreeCommand(plan, envFiles), 60_000, { retryOnLost: true }).catch(() => null)
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
    // Só a central implanta outra ref (adotado refaz o build da pasta; gerenciado grava a revisão vigente).
    const ref = env.source.kind === "central" ? input.ref || null : null
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
    let plan: ComposePlan | null = null
    const progress = newProgress()
    let checkpoint: DeployCheckpoint | null = null
    // Mesmo lugar do último deploy concluído: a falha volta os arquivos gerados aos dele (mover não tem o que voltar).
    const samePlace = Boolean(env.deployedOn && env.deployedOn.buildOn === target.buildOn && env.deployedOn.runOn === target.runOn)
    try {
        const settings = await loadEnvironmentsSettings()
        plan = composePlanOf(env, settings)
        ctx.write(`Deploy de ${env.name}: build no ${machineName(target.buildOn)}, execução no ${machineName(target.runOn)}.\n`)
        commit = await prepareSource(ctx, env, settings, plan, ref, kind)
        tag = commit ?? `t${Date.now()}`
        const version = await readVersion(ctx, plan)
        const { services, envFiles, composeVersion, ownImages } = await prepareCompose(ctx, env, settings, plan, access, target, tag)
        // Antes de subir: a cópia destes arquivos fica pronta e só vira a do último deploy no fim.
        await runStep(ctx, { label: "Cópia dos arquivos deste deploy", command: stageDeployedFilesCommand(plan, String(env._id)), timeoutMs: 30_000 }, { redactedAs: `copiar ${OVERRIDE_FILE} e ${ENV_FILE} deste deploy` })
        const buildServices = services.filter((service) => service.hasBuild && !ownImages.includes(service.name)).map((service) => service.name)
        const pullServices = target.buildOn === target.runOn ? services.filter((service) => ownImages.includes(service.name)).map((service) => service.name) : []
        if (target.buildOn !== target.runOn && buildServices.length) {
            await EnvironmentDeploy.updateOne({ _id: deployId }, { $set: { repositories: buildServices.map((service) => registryRepository(env.slug, service)) } })
        }
        const skipBuild = await canReuseBuild(ctx, env, settings, plan, access, target, commit, buildServices, envFiles)
        if (skipBuild) ctx.write(`\nBuild reaproveitado: as imagens do commit ${commit} já existem no ${machineName(target.buildOn)}.\n`)
        // Daqui em diante o deploy pode ser retomado por outro processo (ex.: o redeploy do próprio app).
        checkpoint = { step: 0, failure: null, ref, commit, tag, version, buildServices, skipBuild, from: env.deployedOn?.runOn ?? null, limits: environmentLimitsOf(env.limits), composeVersion, overrides: env.composeOverrides ?? null, pullServices }
        await EnvironmentDeploy.updateOne({ _id: deployId }, { $set: { checkpoint, version, skipBuild } })
        await runExecution(ctx, env, settings, plan, access, checkpoint, progress)
        await promoteDeployedFiles(ctx, plan, String(env._id))
        await completeDeploy(env, deployId, recorder, checkpoint)
    } catch (error) {
        if (plan) await settleFailedFiles(ctx, plan, String(env._id), { samePlace, progress })
        if (progress.upDone && checkpoint) await recordApplied(env, checkpoint)
        await failDeploy(String(env._id), deployId, recorder, error, commit, tag)
    } finally {
        await recorder.stop()
        await publishEnvironment(String(env._id), "deploy")
    }
}

/** Aviso de que os containers podem divergir do que consta como implantado (o passo que sobe falhou no meio). */
export const DEPLOY_DRIFT_WARNING =
    "O passo que sobe os containers falhou: alguns podem ter ficado com a configuração deste deploy. O que consta como implantado continua o do último deploy concluído; faça um novo deploy para os containers voltarem a bater com ele."

/**
 * Arquivos depois de um deploy que falhou:
 * - antes de subir os containers: voltam aos do último deploy concluído;
 * - o passo que sobe terminou e um passo seguinte falhou: os containers estão com a configuração deste deploy, então
 *   os arquivos ficam os dele e viram a cópia (e quem chama grava o estado aplicado);
 * - o próprio passo que sobe falhou (estado indeterminado): os arquivos voltam aos do último deploy concluído, que
 *   continua sendo o estado gravado, e o log registra a deriva possível dos containers.
 */
async function settleFailedFiles(ctx: DeployContext, plan: ComposePlan, environmentId: string, state: { samePlace: boolean; progress: ExecutionProgress }): Promise<void> {
    if (state.progress.upDone) {
        ctx.write(`\n\u001b[33mOs containers subiram com a configuração deste deploy e um passo seguinte falhou: o override, as variáveis extras e o que consta como implantado passam a ser os deste deploy.\u001b[0m\n`)
        await promoteDeployedFiles(ctx, plan, environmentId)
        return
    }
    if (state.samePlace) await restoreDeployedFiles(ctx, plan, environmentId)
    if (state.progress.upStarted) ctx.write(`\n\u001b[33m${DEPLOY_DRIFT_WARNING}\u001b[0m\n`)
}

/** Fase de execução (`executionSteps`) a partir do passo do ponto de retomada, que avança a cada passo. */
async function runExecution(ctx: DeployContext, env: IEnvironment, settings: EnvironmentsSettings, plan: ComposePlan, access: MachineAccess, checkpoint: DeployCheckpoint, progress: ExecutionProgress = newProgress()): Promise<void> {
    const steps = executionSteps({ settings, plan, buildOn: env.buildOn, runOn: env.runOn, targets: access.targets, buildServices: checkpoint.buildServices, ports: env.ports, healthUrl: env.healthUrl, skipBuild: checkpoint.skipBuild, pullServices: checkpoint.pullServices ?? [], from: checkpoint.from, down: downCommand })
    const upIndex = steps.findIndex((step) => step.label.startsWith("Sobe no "))
    // Retomada: no passo que sobe, o estado é indeterminado; depois dele (sem falha gravada), os containers já subiram.
    if (checkpoint.step > 0 && upIndex >= 0 && checkpoint.step >= upIndex) progress.upStarted = true
    if (checkpoint.step > 0 && upIndex >= 0 && checkpoint.step > upIndex && !checkpoint.failure) progress.upDone = true
    await runSteps(ctx, steps, {
        start: checkpoint.step,
        failure: checkpoint.failure,
        jobIds: (index) => executionJobId(ctx.deployId, index),
        onStep: async (index, failure) => {
            if (index === upIndex && !failure) progress.upStarted = true
            if (index > upIndex && progress.upStarted && !failure) progress.upDone = true
            await EnvironmentDeploy.updateOne({ _id: ctx.deployId }, { $set: { "checkpoint.step": index, "checkpoint.failure": failure } })
        },
    })
}

type Recorder = ReturnType<typeof deployRecorder>

/**
 * Grava o que está aplicado nos containers (máquinas, ref, commit, versão, limites, ajustes e revisão do compose):
 * no sucesso e quando o passo que sobe terminou mas um passo seguinte falhou.
 */
async function recordApplied(env: IEnvironment, checkpoint: DeployCheckpoint): Promise<void> {
    const target = { buildOn: env.buildOn, runOn: env.runOn }
    await Environment.updateOne({ _id: env._id }, { $set: { deployedOn: target, deployedRef: checkpoint.ref ?? (env.source.kind === "central" ? env.source.ref : null), deployedCommit: checkpoint.commit, deployedVersion: checkpoint.version, deployedLimits: checkpoint.limits ?? environmentLimitsOf(env.limits), deployedComposeOverrides: checkpoint.overrides !== undefined ? checkpoint.overrides : (env.composeOverrides ?? null), ...(typeof checkpoint.composeVersion === "number" ? { deployedComposeVersion: checkpoint.composeVersion } : {}), updatedAt: new Date() } })
    if (typeof checkpoint.composeVersion === "number") await markComposeDeployed(String(env._id), checkpoint.composeVersion)
}

async function completeDeploy(env: IEnvironment, deployId: string, recorder: Recorder, checkpoint: DeployCheckpoint): Promise<void> {
    const target = { buildOn: env.buildOn, runOn: env.runOn }
    await recordApplied(env, checkpoint)
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
    await recordDeployWatchFact(deployId, status, error)
    emitDeploy(deployId, { type: "status", status, error })
    await notifyOpexIfAsked(deployId)
}

/**
 * Observações do Agente Opex (OPE-194) no ambiente do deploy: o fato fica gravado logo depois do fim do
 * deploy (só com observação no ambiente); o disparo segue em segundo plano. Nunca segura o deploy.
 */
async function recordDeployWatchFact(deployId: string, status: "success" | "failed", error: string | null): Promise<void> {
    try {
        const deploy = await EnvironmentDeploy.findById(deployId).select({ environmentId: 1 }).lean<Pick<IEnvironmentDeploy, "environmentId">>()
        if (!deploy?.environmentId) return
        const { watchDeployFinished } = await import("@/features/opex-agent/server/watch-events")
        await watchDeployFinished(String(deploy.environmentId), { status, error })
    } catch (err) {
        envLog.warn({ err: err instanceof Error ? err.message : err, deployId }, "[environments] Falha ao avisar as observações do Agente Opex")
    }
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
    let plan: ComposePlan | null = null
    let samePlace = false
    const progress = newProgress()
    let resumedEnv: IEnvironment | null = null
    busy().add(envId)
    try {
        if (!checkpoint) throw new StepError(INTERRUPTED_BEFORE_EXECUTION)
        const saved = await loadEnvironment(envId)
        const env: IEnvironment = { ...saved, buildOn: deploy.buildOn, runOn: deploy.runOn }
        resumedEnv = env
        const access = await machineAccess(run)
        if ((env.buildOn === "pc" || env.runOn === "pc") && !access.pcAvailable) throw new StepError(`Não foi possível retomar o deploy depois de o app reiniciar: ${access.pcReason ?? "o PC não está disponível"}`)
        const settings = await loadEnvironmentsSettings()
        ctx.write(`\n\u001b[33m↻ O app reiniciou durante o deploy: retomando no passo ${checkpoint.step + 1}.\u001b[0m\n`)
        envLog.info({ id: envId, deployId, step: checkpoint.step }, "[environments] Retomando deploy interrompido")
        plan = composePlanOf(env, settings)
        samePlace = Boolean(saved.deployedOn && saved.deployedOn.buildOn === env.buildOn && saved.deployedOn.runOn === env.runOn)
        await runExecution(ctx, env, settings, plan, access, checkpoint, progress)
        await promoteDeployedFiles(ctx, plan, envId)
        await completeDeploy(env, deployId, recorder, checkpoint)
    } catch (error) {
        if (plan) await settleFailedFiles(ctx, plan, envId, { samePlace, progress })
        if (progress.upDone && checkpoint && resumedEnv) await recordApplied(resumedEnv, checkpoint)
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
    // Logs também rodam o compose: sem o arquivo de variáveis declarado, ele falharia.
    await ensureComposeEnvFiles(plan, target, run)
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
        await ensureComposeEnvFiles(plan, access.targets[on], run)
        const down = await run(`${downCommand(plan, access.targets[on], options.volumes)}${on === "pc" && env.ports.length ? `; ${cancelPorts(env.ports)}` : ""}`, 300_000, { detached: true })
        if (down.exitCode !== 0) throw new DomainError(502, `Não foi possível derrubar o ambiente: ${down.output.split("\n").pop() ?? ""}`, "ENVIRONMENT_ACTION_FAILED")
    }
    if (env.source.kind === "central") {
        const { config } = await loadCentral(env.source.centralId).catch(() => ({ config: null }))
        if (config) await run(removeWorktreeCommand(settings, config.sessionDirectory, env.slug), 120_000)
    } else if (env.source.kind === "managed") {
        await run(removeEnvDirCommand(settings, env.slug), 120_000)
        await deleteComposeRevisions(id)
    } else {
        await run(removeGeneratedCommand(plan), 30_000)
    }
    // As cópias dos arquivos dos deploys ficam numa pasta só do Opex (nunca a do projeto).
    await run(dropDeployedFilesCommand(plan, id), 30_000).catch(() => undefined)
    await Environment.deleteOne({ _id: id })
    await EnvironmentDeploy.deleteMany({ environmentId: id })
    await recordAudit({ userId: actorId, entidade: ENVIRONMENTS_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.EXCLUIR, antes: { nome: env.name, slug: env.slug, projeto: env.source.projectName }, depois: { volumesApagados: options.volumes } })
    envLog.info({ id, slug: env.slug }, "[environments] Ambiente apagado")
    await publishEnvironment(id, "deleted", { centralId: env.source.kind === "central" ? env.source.centralId : null })
}
