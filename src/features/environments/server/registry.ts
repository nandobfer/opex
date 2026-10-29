import type { HostRunner } from "@/features/local-docker/server/shell"
import { deleteTagCommand, ensureRegistryCommand, garbageCollectCommand, registryCatalogCommand, registryStatusCommand, registryTagsCommand } from "../commands"
import { REGISTRY_NAMESPACE } from "../constants"
import type { RegistryStatusDto } from "../types"
import { Environment, EnvironmentDeploy, environmentsDb, type IEnvironment, type IEnvironmentDeploy } from "./models"
import { envLog, loadEnvironmentsSettings, runEnvHost } from "./settings"

const parseJson = <T>(output: string): T | null => {
    const start = output.indexOf("{")
    if (start < 0) return null
    try {
        return JSON.parse(output.slice(start)) as T
    } catch {
        return null
    }
}

/** Tags a apagar: as que não estão entre as `keep` mais recentes dos deploys com sucesso (puro). */
export function tagsToDelete(tags: string[], recent: string[], keep: number): string[] {
    const kept = new Set(recent.slice(0, keep))
    return tags.filter((tag) => !kept.has(tag))
}

/**
 * Ambiente dono do repositório `opex-env/<slug>-<serviço>` (puro). Vale primeiro o registro exato
 * dos deploys (`repositories` de cada ambiente). Sem registro (deploys antigos), o prefixo do slug —
 * mas slug e serviço aceitam hífen: com mais de um slug casando (ex.: `crm` e `crm-hml` para
 * `crm-hml-web`) o dono é ambíguo e o repositório fica de fora (nunca apaga tags de outro ambiente).
 */
export function repositoryOwner(repo: string, slugs: readonly string[], recorded: ReadonlyMap<string, string> = new Map()): string | null {
    const exact = recorded.get(repo)
    if (exact) return exact
    const owners = slugs.filter((slug) => repo.startsWith(`${REGISTRY_NAMESPACE}/${slug}-`))
    return owners.length === 1 ? owners[0]! : null
}

export async function getRegistryStatus(run: HostRunner = runEnvHost): Promise<RegistryStatusDto> {
    const settings = await loadEnvironmentsSettings()
    const output = (await run(registryStatusCommand(), 20_000)).output.trim()
    const running = output === "true"
    return { running, port: settings.registryPort, detail: running ? `No ar em 127.0.0.1:${settings.registryPort}` : output === "missing" ? "Ainda não criado (sobe no primeiro deploy entre máquinas)" : "Parado" }
}

export async function ensureRegistry(run: HostRunner = runEnvHost): Promise<RegistryStatusDto> {
    const settings = await loadEnvironmentsSettings()
    await run(ensureRegistryCommand(settings), 120_000)
    return getRegistryStatus(run)
}

/**
 * Rotina `environments-registry-cleanup` (diária, nasce desligada): mantém as N últimas tags de cada
 * ambiente (pelos deploys com sucesso) e roda o `garbage-collect` do registry.
 */
export async function runRegistryCleanup(run: HostRunner = runEnvHost): Promise<string> {
    const settings = await loadEnvironmentsSettings()
    if ((await run(registryStatusCommand(), 20_000)).output.trim() !== "true") return "Registry dos ambientes não está no ar: nada a limpar"
    const catalog = parseJson<{ repositories?: string[] }>((await run(registryCatalogCommand(settings), 30_000)).output)
    const repositories = (catalog?.repositories ?? []).filter((repo) => repo.startsWith(`${REGISTRY_NAMESPACE}/`))
    await environmentsDb()
    const envs = await Environment.find().select({ slug: 1 }).lean<IEnvironment[]>()
    const slugs = envs.map((env) => env.slug)
    const slugOf = new Map(envs.map((env) => [String(env._id), env.slug]))
    const recorded = new Map<string, string>()
    const withRepos = await EnvironmentDeploy.find({ repositories: { $exists: true, $ne: [] } }).select({ environmentId: 1, repositories: 1 }).lean<IEnvironmentDeploy[]>()
    for (const deploy of withRepos) {
        const slug = slugOf.get(deploy.environmentId)
        if (slug) for (const repo of deploy.repositories ?? []) recorded.set(repo, slug)
    }
    let removed = 0
    for (const env of envs) {
        const deploys = await EnvironmentDeploy.find({ environmentId: String(env._id), status: "success", imageTag: { $ne: null } }).sort({ startedAt: -1 }).select({ imageTag: 1 }).lean<IEnvironmentDeploy[]>()
        const recent = [...new Set(deploys.map((item) => item.imageTag!).filter(Boolean))]
        for (const repo of repositories.filter((name) => repositoryOwner(name, slugs, recorded) === env.slug)) {
            const tags = parseJson<{ tags?: string[] | null }>((await run(registryTagsCommand(settings, repo), 30_000)).output)?.tags ?? []
            for (const tag of tagsToDelete(tags, recent, settings.keepTags)) {
                if ((await run(deleteTagCommand(settings, repo, tag), 30_000)).exitCode === 0) removed += 1
            }
        }
    }
    const gc = await run(garbageCollectCommand(), 600_000, { detached: true })
    if (gc.exitCode !== 0) throw new Error(`garbage-collect falhou: ${gc.output.slice(-300)}`)
    envLog.info({ removed }, "[environments] Limpeza do registry concluída")
    return `${removed} tag(s) apagada(s) do registry; garbage-collect concluído`
}
