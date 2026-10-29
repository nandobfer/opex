import { isValidObjectId } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { decryptSecret, encryptSecret } from "@/lib/crypto/secretBox"
import { AgenticWorkbench } from "@/lib/db/models/Agentic"
import { quote } from "@/features/local-docker/commands"
import { LocalDockerPreview } from "@/features/local-docker/server/models"
import { containerVersionsCommand, envDir, gitDirsCommand, parseContainerVersions, parseGitDirs, parseSnapshot, snapshotCommand, type ComposeContainer, type ComposePlan } from "../commands"
import { ENVIRONMENTS_AUDIT_ENTITY, REGISTRY_CONTAINER } from "../constants"
import type { AdoptInput, EnvironmentInput, EnvironmentsSettings, Machine } from "../schemas"
import type { EnvironmentDeployDto, EnvironmentDeploySummaryDto, EnvironmentDto, EnvironmentsListDto, ServiceStatusDto, UnmanagedProjectDto } from "../types"
import { deployLogSoFar } from "./hub"
import { Environment, EnvironmentDeploy, environmentsDb, type IEnvironment, type IEnvironmentDeploy } from "./models"
import { envLog, machineAccess, publishEnvironment, runEnvHost } from "./settings"
import type { HostRunner } from "@/features/local-docker/server/shell"

/** Pasta e arquivos do compose de um ambiente (puro). */
export function composePlanOf(env: Pick<IEnvironment, "slug" | "source">, settings: EnvironmentsSettings): ComposePlan {
    const source = env.source
    if (source.kind === "central") return { projectName: source.projectName, dir: envDir(settings, env.slug), filesOn: "server", composeFiles: [source.composeFile], services: source.services }
    return { projectName: source.projectName, dir: quote(source.workingDir), filesOn: source.machine, composeFiles: source.configFiles, services: [] }
}

export function deploySummary(deploy: IEnvironmentDeploy): EnvironmentDeploySummaryDto {
    return {
        id: String(deploy._id),
        kind: deploy.kind,
        status: deploy.status,
        ref: deploy.ref,
        commit: deploy.commit,
        buildOn: deploy.buildOn,
        runOn: deploy.runOn,
        error: deploy.error,
        startedAt: new Date(deploy.startedAt).toISOString(),
        finishedAt: deploy.finishedAt ? new Date(deploy.finishedAt).toISOString() : null,
        durationMs: deploy.finishedAt ? Math.max(0, new Date(deploy.finishedAt).getTime() - new Date(deploy.startedAt).getTime()) : null,
        version: deploy.version ?? null,
        skipBuild: Boolean(deploy.skipBuild),
        resumed: Boolean(deploy.resumed),
    }
}

export function toEnvironmentDto(env: IEnvironment, lastDeploy: IEnvironmentDeploy | null, services: ServiceStatusDto[]): EnvironmentDto {
    return {
        id: String(env._id),
        name: env.name,
        slug: env.slug,
        source: env.source,
        envKeys: env.env.map((item) => item.key),
        ports: env.ports,
        healthUrl: env.healthUrl,
        buildOn: env.buildOn,
        runOn: env.runOn,
        deployedOn: env.deployedOn,
        deployedVersion: env.deployedVersion ?? null,
        lastDeploy: lastDeploy ? deploySummary(lastDeploy) : null,
        services,
        createdAt: new Date(env.createdAt).toISOString(),
        updatedAt: new Date(env.updatedAt).toISOString(),
    }
}

const toService = (item: ComposeContainer): ServiceStatusDto => ({ service: item.service, container: item.name, state: item.state, status: item.status, ports: item.ports, cpu: item.cpu, memory: item.memory, version: versionCache().get(item.id) ?? null })

/** Versão do `package.json` por id de container (por processo): o id muda quando o compose recria o container. */
const VERSIONS_KEY = Symbol.for("opex.environments.container-versions")
const versionStore = globalThis as unknown as Record<symbol, Map<string, string | null> | undefined>
const versionCache = () => (versionStore[VERSIONS_KEY] ??= new Map())
const VERSION_CACHE_MAX = 500

/** Lê (uma vez por container) a versão dos containers no ar que ainda não estão no cache. */
export async function loadContainerVersions(machine: Machine, context: string, containers: ComposeContainer[], run: HostRunner): Promise<void> {
    const cache = versionCache()
    const ids = [...new Set(containers.filter((item) => item.state === "running" && item.id && !cache.has(item.id)).map((item) => item.id))]
    if (!ids.length) return
    const result = await run(containerVersionsCommand(machine, context, ids), 30_000, { retryOnLost: true, quiet: true }).catch(() => null)
    if (result?.exitCode !== 0) return
    if (cache.size > VERSION_CACHE_MAX) cache.clear()
    const found = parseContainerVersions(result.output)
    for (const id of ids) if (found.has(id)) cache.set(id, found.get(id) ?? null)
}

export async function loadEnvironment(id: string): Promise<IEnvironment> {
    if (!isValidObjectId(id)) throw new DomainError(404, "Ambiente não encontrado", "ENVIRONMENT_NOT_FOUND")
    await environmentsDb()
    const env = await Environment.findById(id).lean<IEnvironment>()
    if (!env) throw new DomainError(404, "Ambiente não encontrado", "ENVIRONMENT_NOT_FOUND")
    return env
}

/** Variáveis extras decifradas (só no servidor, para gravar o `.env.opex`). */
export function envVarsOf(env: Pick<IEnvironment, "env">): { key: string; value: string }[] {
    return env.env.map((item) => ({ key: item.key, value: decryptSecret(item.value) }))
}

/** Grupos da descoberta que não são ambientes: prévias das mesas e do PC (puro). */
export function groupUnmanaged(machine: Machine, containers: ComposeContainer[], excluded: ReadonlySet<string>, gitDirs: ReadonlySet<string>): UnmanagedProjectDto[] {
    const groups = new Map<string, ComposeContainer[]>()
    for (const item of containers) {
        if (excluded.has(item.project) || item.name === REGISTRY_CONTAINER) continue
        groups.set(item.project, [...(groups.get(item.project) ?? []), item])
    }
    return [...groups.entries()]
        .map(([projectName, items]) => {
            const first = items.find((item) => item.workingDir) ?? items[0]!
            return {
                machine,
                projectName,
                workingDir: first.workingDir || null,
                configFiles: first.configFiles,
                git: Boolean(first.workingDir && gitDirs.has(first.workingDir)),
                containers: items.length,
                running: items.filter((item) => item.state === "running").length,
            }
        })
        .sort((a, b) => a.projectName.localeCompare(b.projectName))
}

async function snapshot(machine: Machine, context: string, run: HostRunner): Promise<ComposeContainer[]> {
    const result = await run(snapshotCommand(machine, context), 30_000, { retryOnLost: true })
    return result.exitCode === 0 ? parseSnapshot(result.output) : []
}

/** Projetos do compose que pertencem às prévias das mesas (ficam de fora da descoberta). */
async function previewProjects(): Promise<Set<string>> {
    const [workbenches, pc] = await Promise.all([AgenticWorkbench.find({ composeProject: { $ne: null } }).select({ composeProject: 1 }).lean(), LocalDockerPreview.find().select({ composeProject: 1 }).lean()])
    return new Set([...workbenches.map((item) => item.composeProject).filter((name): name is string => Boolean(name)), ...pc.map((item) => item.composeProject)])
}

/**
 * Estado dos ambientes informados (snapshot dos Dockers onde eles rodam, versões e último deploy). Usado
 * pela lista do dono e pelo portal do cliente (que passa só os ambientes vinculados ao cliente).
 */
export async function environmentItems(envs: IEnvironment[], run: HostRunner = runEnvHost): Promise<{ items: EnvironmentDto[]; byMachine: Record<Machine, ComposeContainer[]>; access: Awaited<ReturnType<typeof machineAccess>> }> {
    const access = await machineAccess(run)
    const needs = (machine: Machine) => envs.some((env) => (env.deployedOn?.runOn ?? env.runOn) === machine)
    const [server, pc] = await Promise.all([
        needs("server") ? snapshot("server", access.targets.server.context, run) : Promise.resolve([]),
        access.pcAvailable && needs("pc") ? snapshot("pc", access.targets.pc.context, run) : Promise.resolve([]),
    ])
    return { ...(await itemsOf(envs, { server, pc }, access, run)), access }
}

async function itemsOf(envs: IEnvironment[], byMachine: Record<Machine, ComposeContainer[]>, access: Awaited<ReturnType<typeof machineAccess>>, run: HostRunner): Promise<{ items: EnvironmentDto[]; byMachine: Record<Machine, ComposeContainer[]> }> {
    const deployIds = envs.map((env) => env.lastDeployId).filter((id): id is string => Boolean(id && isValidObjectId(id)))
    const deploys = new Map((await EnvironmentDeploy.find({ _id: { $in: deployIds } }).select({ log: 0 }).lean<IEnvironmentDeploy[]>()).map((item) => [String(item._id), item]))
    const projects = new Set(envs.map(composeProjectOf))
    await Promise.all(
        (["server", "pc"] as const).map((machine) => loadContainerVersions(machine, access.targets[machine].context, byMachine[machine].filter((item) => projects.has(item.project)), run)),
    )
    // Deploy cujo processo morreu (ex.: o redeploy do próprio app): retomado em segundo plano.
    void import("./resume").then(({ scheduleDeployResume }) => scheduleDeployResume(run)).catch((error: unknown) => envLog.warn({ err: error }, "[environments] Falha ao retomar deploys interrompidos"))
    const items = envs.map((env) => {
        const on = env.deployedOn?.runOn ?? env.runOn
        const services = byMachine[on].filter((item) => item.project === composeProjectOf(env)).map(toService)
        return toEnvironmentDto(env, (env.lastDeployId && deploys.get(env.lastDeployId)) || null, services)
    })
    return { items, byMachine }
}

/** Lista com o estado dos serviços (snapshot dos dois Dockers) e os projetos não gerenciados. */
export async function listEnvironments(run: HostRunner = runEnvHost): Promise<EnvironmentsListDto> {
    await environmentsDb()
    const access = await machineAccess(run)
    const [envs, server, pc, previews] = await Promise.all([
        Environment.find().sort({ name: 1 }).lean<IEnvironment[]>(),
        snapshot("server", access.targets.server.context, run),
        access.pcAvailable ? snapshot("pc", access.targets.pc.context, run) : Promise.resolve([]),
        previewProjects(),
    ])
    const { items, byMachine } = await itemsOf(envs, { server, pc }, access, run)
    const managed = new Set(envs.map(composeProjectOf))
    const excluded = new Set([...managed, ...previews])
    const unmanaged: UnmanagedProjectDto[] = []
    for (const machine of ["server", "pc"] as const) {
        const containers = byMachine[machine].filter((item) => !excluded.has(item.project))
        const dirs = [...new Set(containers.map((item) => item.workingDir).filter(Boolean))]
        const git = dirs.length ? parseGitDirs((await run(gitDirsCommand(machine, dirs), 20_000, { retryOnLost: true })).output) : new Set<string>()
        unmanaged.push(...groupUnmanaged(machine, containers, excluded, git))
    }
    return { items, unmanaged, pcAvailable: access.pcAvailable, pcReason: access.pcReason, checkedAt: new Date().toISOString() }
}

export const composeProjectOf = (env: Pick<IEnvironment, "source">) => env.source.projectName

export async function getEnvironment(id: string, run: HostRunner = runEnvHost): Promise<EnvironmentDto> {
    const list = await listEnvironments(run)
    const item = list.items.find((env) => env.id === id)
    if (!item) throw new DomainError(404, "Ambiente não encontrado", "ENVIRONMENT_NOT_FOUND")
    return item
}

/** Variáveis da edição: valor vazio mantém o salvo (o valor nunca volta para a tela). */
export function mergeEnvVars(input: EnvironmentInput["env"], saved: IEnvironment["env"]): IEnvironment["env"] {
    const previous = new Map(saved.map((item) => [item.key, item.value]))
    return input.map(({ key, value }) => {
        if (value === "" && previous.has(key)) return { key, value: previous.get(key)! }
        return { key, value: encryptSecret(value) }
    })
}

async function assertUnique(input: Pick<EnvironmentInput, "slug" | "source">, ignoreId: string | null): Promise<void> {
    const others = await Environment.find(ignoreId ? { _id: { $ne: ignoreId } } : {}).select({ slug: 1, source: 1 }).lean<IEnvironment[]>()
    if (others.some((env) => env.slug === input.slug)) throw new DomainError(409, `Já existe um ambiente com o slug "${input.slug}"`, "ENVIRONMENT_SLUG_TAKEN")
    if (others.some((env) => env.source.projectName === input.source.projectName)) throw new DomainError(409, `Já existe um ambiente com o projeto do compose "${input.source.projectName}"`, "ENVIRONMENT_PROJECT_TAKEN")
}

const auditView = (env: Pick<IEnvironment, "name" | "slug" | "source" | "ports" | "healthUrl" | "buildOn" | "runOn"> & { env: { key: string }[] }) => ({
    nome: env.name,
    slug: env.slug,
    origem: env.source.kind,
    projeto: env.source.projectName,
    variaveis: env.env.map((item) => item.key),
    portas: env.ports,
    saude: env.healthUrl,
    buildEm: env.buildOn,
    executarEm: env.runOn,
})

export async function createEnvironment(input: EnvironmentInput, actorId: string): Promise<IEnvironment> {
    await environmentsDb()
    await assertUnique(input, null)
    const doc = await Environment.create({ ...input, healthUrl: input.healthUrl || null, env: mergeEnvVars(input.env, []), createdAt: new Date(), updatedAt: new Date() })
    const env = doc.toObject() as IEnvironment
    await recordAudit({ userId: actorId, entidade: ENVIRONMENTS_AUDIT_ENTITY, entidadeId: String(env._id), acao: AcaoAuditoria.CRIAR, depois: auditView(env) })
    envLog.info({ id: String(env._id), slug: env.slug }, "[environments] Ambiente criado")
    await publishEnvironment(String(env._id), "created")
    return env
}

export async function updateEnvironment(id: string, input: EnvironmentInput, actorId: string): Promise<IEnvironment> {
    const before = await loadEnvironment(id)
    if (before.slug !== input.slug && before.deployedOn) throw new DomainError(409, "Derrube o ambiente antes de trocar o slug", "ENVIRONMENT_DEPLOYED")
    if (before.source.projectName !== input.source.projectName && before.deployedOn) throw new DomainError(409, "Derrube o ambiente antes de trocar o projeto do compose", "ENVIRONMENT_DEPLOYED")
    await assertUnique(input, id)
    const set = { ...input, healthUrl: input.healthUrl || null, env: mergeEnvVars(input.env, before.env), updatedAt: new Date() }
    await Environment.updateOne({ _id: id }, { $set: set })
    await recordAudit({ userId: actorId, entidade: ENVIRONMENTS_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, antes: auditView(before), depois: auditView({ ...before, ...set }) })
    await publishEnvironment(id, "updated")
    return loadEnvironment(id)
}

/** Adota um projeto do compose já em execução (com ou sem git). */
export async function adoptProject(input: AdoptInput, actorId: string, run: HostRunner = runEnvHost): Promise<IEnvironment> {
    const list = await listEnvironments(run)
    const project = list.unmanaged.find((item) => item.machine === input.machine && item.projectName === input.projectName)
    if (!project) throw new DomainError(404, "Projeto não encontrado entre os não gerenciados (ele ainda está em execução?)", "ENVIRONMENT_PROJECT_NOT_FOUND")
    if (!project.workingDir || !project.configFiles.length) throw new DomainError(422, "O projeto não informa a pasta nem os arquivos do compose (labels do Docker Compose ausentes)", "ENVIRONMENT_PROJECT_INCOMPLETE")
    const source = { kind: "adopted" as const, machine: project.machine, workingDir: project.workingDir, configFiles: project.configFiles, projectName: project.projectName, git: project.git, pullOnRedeploy: false }
    const env = await createEnvironment({ name: input.name, slug: input.slug, source, env: [], ports: [], healthUrl: "", buildOn: project.machine, runOn: project.machine }, actorId)
    await Environment.updateOne({ _id: env._id }, { $set: { deployedOn: { buildOn: project.machine, runOn: project.machine } } })
    return { ...env, deployedOn: { buildOn: project.machine, runOn: project.machine } }
}

/** Ambiente pelo id ou pelo slug (ferramentas do Agente Opex). */
export async function resolveEnvironmentRef(ref: string): Promise<IEnvironment> {
    const value = ref.trim()
    if (isValidObjectId(value)) {
        await environmentsDb()
        const byId = await Environment.findById(value).lean<IEnvironment>()
        if (byId) return byId
    }
    await environmentsDb()
    const bySlug = await Environment.findOne({ slug: value.toLowerCase() }).lean<IEnvironment>()
    if (!bySlug) throw new DomainError(404, `Ambiente "${value}" não encontrado (use o id ou o slug de list_environments)`, "ENVIRONMENT_NOT_FOUND")
    return bySlug
}

/** Um deploy com o log: o ao vivo deste processo quando em andamento, senão o gravado. */
export async function getDeploy(deployId: string): Promise<EnvironmentDeployDto> {
    if (!isValidObjectId(deployId)) throw new DomainError(404, "Deploy não encontrado", "ENVIRONMENT_DEPLOY_NOT_FOUND")
    await environmentsDb()
    const deploy = await EnvironmentDeploy.findById(deployId).lean<IEnvironmentDeploy>()
    if (!deploy) throw new DomainError(404, "Deploy não encontrado", "ENVIRONMENT_DEPLOY_NOT_FOUND")
    const live = deploy.status === "running" ? deployLogSoFar(deployId) : null
    return { ...deploySummary(deploy), environmentId: deploy.environmentId, log: live ?? deploy.log ?? "" }
}

export async function listDeploys(environmentId: string): Promise<EnvironmentDeploySummaryDto[]> {
    await loadEnvironment(environmentId)
    const rows = await EnvironmentDeploy.find({ environmentId }).select({ log: 0 }).sort({ startedAt: -1 }).limit(30).lean<IEnvironmentDeploy[]>()
    return rows.map(deploySummary)
}
