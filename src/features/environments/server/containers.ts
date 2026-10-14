import { dbConnect } from "@/lib/db"
import { Environment } from "@/lib/db/models/Environment"
import { logger } from "@/lib/logger"
import { STATUS_REFRESH_MS } from "../constants"
import { groupComposeProjects, type ParsedProjectContainer } from "../parsers"
import { pickComposeProject, type ComposeProjectCandidate } from "../logic"
import type { EnvironmentStatus } from "../types"
import { listHostContainers } from "./docker"
import { effectiveProjectName, loadEnvironmentRuntime, type EnvironmentRuntime } from "./context"
import { publishEnvironmentsUpdated } from "./realtime"

/**
 * Containers reais de um ambiente. Usa as **labels do projeto Compose** (`docker ps`), o que
 * funciona tanto para o projeto criado pelo Opex quanto para um projeto **já em execução** adotado
 * pelo ambiente. Nenhuma consulta exige o override do compose.
 */

/** Nome efetivo do projeto Compose (adotado ou derivado do Opex). */
export { effectiveProjectName }

export interface HostContainers {
    containers: ParsedProjectContainer[]
    reachable: boolean
    error: string | null
}

/** Containers do host; quando o host não responde, `reachable: false` (nunca "Parado"). */
export async function listEnvironmentHostContainers(runtime: EnvironmentRuntime): Promise<HostContainers> {
    try {
        const containers = await listHostContainers(runtime.host, { cwd: runtime.directory })
        return { containers, reachable: true, error: null }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.warn({ err: message }, "[environments] Host indisponível para listar containers")
        return { containers: [], reachable: false, error: message }
    }
}

/** Containers do projeto Compose efetivo do ambiente. */
export async function environmentContainers(runtime: EnvironmentRuntime): Promise<HostContainers & { projectName: string }> {
    const projectName = effectiveProjectName(runtime)
    const host = await listEnvironmentHostContainers(runtime)
    return { ...host, projectName, containers: host.containers.filter((container) => container.project === projectName) }
}

export interface DiscoveryResult {
    /** Projeto encontrado e adotável. */
    project: string | null
    /** Mais de um projeto candidato: o usuário precisa escolher. */
    ambiguous: boolean
    candidates: ComposeProjectCandidate[]
    reachable: boolean
    error: string | null
}

/**
 * Descobre um projeto Compose **já existente** no host que corresponda ao diretório e ao arquivo do
 * compose do ambiente. Não reinicia nem recria nada: só identifica a identidade real.
 */
export async function discoverComposeProject(runtime: EnvironmentRuntime): Promise<DiscoveryResult> {
    const host = await listEnvironmentHostContainers(runtime)
    if (!host.reachable) return { project: null, ambiguous: false, candidates: [], reachable: false, error: host.error }
    const candidates = groupComposeProjects(host.containers)
    const { project, ambiguous } = pickComposeProject(candidates, { directory: runtime.directory, composeFile: runtime.invocation.composeFile })
    const matching = candidates.filter((candidate) => candidate.workingDir && candidate.workingDir.replace(/\/+$/, "") === runtime.directory.replace(/\/+$/, ""))
    return { project: project?.project ?? null, ambiguous, candidates: ambiguous ? matching : candidates, reachable: true, error: null }
}

/** Monta o status do ambiente a partir dos containers do projeto efetivo. */
export function buildEnvironmentStatus(containers: readonly ParsedProjectContainer[], host: HostContainers): EnvironmentStatus {
    const runningCount = containers.filter((container) => /^running$/i.test(container.state)).length
    return {
        containers: containers.map((container) => ({
            name: container.name,
            service: container.service,
            state: container.state,
            status: container.status,
            image: container.image,
            health: null,
        })),
        running: runningCount > 0,
        partial: runningCount > 0 && runningCount < containers.length,
        reachable: host.reachable,
        error: host.error,
        checkedAt: host.reachable ? new Date().toISOString() : null,
    }
}

/** Consulta o host e **persiste** o status do ambiente (usado ao selecionar o ambiente). */
export async function inspectEnvironmentStatus(runtime: EnvironmentRuntime): Promise<EnvironmentStatus> {
    const host = await listEnvironmentHostContainers(runtime)
    const projectName = effectiveProjectName(runtime)
    const containers = host.containers.filter((container) => container.project === projectName)
    const status = buildEnvironmentStatus(containers, host)
    await dbConnect()
    await Environment.updateOne(
        { _id: runtime.env._id },
        {
            $set: {
                status: {
                    containers: status.containers,
                    running: status.running,
                    partial: status.partial,
                    reachable: status.reachable,
                    error: status.error,
                    checkedAt: status.checkedAt ? new Date(status.checkedAt) : null,
                },
            },
        },
    )
    return status
}

/**
 * Atualiza o status de um ambiente respeitando o intervalo mínimo (`force` ignora o cache). Publica
 * no Pusher quando o status mudou. Nunca lança.
 */
export async function refreshEnvironmentStatus(envId: string, options: { force?: boolean } = {}): Promise<EnvironmentStatus | null> {
    try {
        await dbConnect()
        const env = await Environment.findById(envId).select({ status: 1, projectId: 1 }).lean()
        if (!env) return null
        const checkedAt = env.status?.checkedAt ? new Date(env.status.checkedAt).getTime() : 0
        if (!options.force && Date.now() - checkedAt < STATUS_REFRESH_MS) {
            return env.status ? { ...env.status, checkedAt: env.status.checkedAt ? new Date(env.status.checkedAt).toISOString() : null } : null
        }
        const runtime = await loadEnvironmentRuntime(envId)
        const status = await inspectEnvironmentStatus(runtime)
        await publishEnvironmentsUpdated(String(env.projectId), "status")
        return status
    } catch (error) {
        logger.warn({ err: error instanceof Error ? error.message : error, envId }, "[environments] Falha ao atualizar o status")
        return null
    }
}
