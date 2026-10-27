import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { AgenticWorkbench } from "@/lib/db/models/Agentic"
import {
    aliasContainers,
    aliasDeleteCommand,
    aliasRunCommand,
    builderContainerName,
    builderDeleteCommand,
    builderEnsureCommand,
    builderLimitsOf,
    builderStartCommand,
    builderStopCommand,
    listContainersCommand,
    parseContainers,
    parseStats,
    previewDeleteCommand,
    previewRecreateCommand,
    startContainerCommand,
    statsCommand,
    stopContainerCommand,
    type PcContainer,
} from "../commands"
import { LOCAL_DOCKER_AUDIT_ENTITY } from "../constants"
import type { LocalDockerContainerAction, LocalDockerSettings } from "../schemas"
import type { LocalDockerContainerDto, LocalDockerContainersDto } from "../types"
import { LocalDockerPreview, LocalDockerState, localDockerDb, type ILocalDockerPreview } from "./models"
import { loadState, localDockerLog, publishLocalDocker, settingsOf } from "./settings"
import { builderDebug, lastLine, runOnHost, type HostRunner } from "./shell"
import { cancelForward, isTunnelOpen } from "./tunnel"

/**
 * Containers do PC na aba Túnel: as prévias (projetos registrados pela Builder Machine) e os de ambiente (apelidos
 * e builder do preparo), com CPU/memória e ações individuais. Containers de outra origem não aparecem
 * nem podem ser tocados por aqui.
 */

interface Classified {
    container: PcContainer
    kind: LocalDockerContainerDto["kind"]
    preview: ILocalDockerPreview | null
}

function classify(settings: LocalDockerSettings, containers: PcContainer[], previews: ILocalDockerPreview[]): Classified[] {
    const byProject = new Map(previews.map((item) => [item.composeProject, item]))
    const aliases = new Set(aliasContainers(settings, containers).map((item) => item.name))
    const builder = builderContainerName(settings)
    const result: Classified[] = []
    for (const container of containers) {
        const preview = container.composeProject ? (byProject.get(container.composeProject) ?? null) : null
        if (preview) result.push({ container, kind: "preview", preview })
        else if (aliases.has(container.name)) result.push({ container, kind: "alias", preview: null })
        else if (container.name === builder) result.push({ container, kind: "builder", preview: null })
    }
    return result
}

async function snapshot(settings: LocalDockerSettings, run: HostRunner): Promise<Classified[]> {
    const listed = await run(listContainersCommand(settings), 30_000)
    if (listed.exitCode !== 0) throw new DomainError(502, `O Docker do PC não respondeu${lastLine(listed.output) ? `: ${lastLine(listed.output)}` : ""}`, "LOCAL_DOCKER_DOCKER_FAILED")
    await localDockerDb()
    const previews = await LocalDockerPreview.find({}).lean<ILocalDockerPreview[]>()
    return classify(settings, parseContainers(listed.output), previews)
}

export async function listPcContainers(run: HostRunner = runOnHost): Promise<LocalDockerContainersDto> {
    const checkedAt = new Date().toISOString()
    const { settings } = settingsOf(await loadState())
    if (!(await isTunnelOpen(run))) return { available: false, reason: "Túnel fechado: abra o túnel para ver os containers do PC", previews: [], environment: [], checkedAt }
    let items: Classified[]
    try {
        items = await snapshot(settings, run)
    } catch (error) {
        return { available: false, reason: error instanceof Error ? error.message : String(error), previews: [], environment: [], checkedAt }
    }
    const stats = items.some((item) => item.container.state === "running") ? parseStats((await run(statsCommand(settings), 30_000)).output) : new Map()
    const workbenchIds = items.map((item) => item.preview?.workbenchId).filter((id): id is string => Boolean(id))
    const codes = new Map(
        workbenchIds.length ? (await AgenticWorkbench.find({ _id: { $in: workbenchIds } }, { taskCode: 1 }).lean<{ _id: unknown; taskCode: string }[]>()).map((doc) => [String(doc._id), doc.taskCode]) : [],
    )
    const toDto = ({ container, kind, preview }: Classified): LocalDockerContainerDto => ({
        name: container.name,
        kind,
        state: container.state,
        status: container.status,
        image: container.image,
        ports: container.ports,
        stats: stats.get(container.name) ?? null,
        composeProject: preview?.composeProject ?? null,
        service: preview ? container.composeService || null : null,
        workbenchId: preview?.workbenchId ?? null,
        taskCode: preview ? (codes.get(preview.workbenchId) ?? null) : null,
        port: preview?.port ?? null,
        alias: kind === "alias" ? container.alias || null : null,
        target: kind === "alias" ? container.target || null : null,
    })
    return {
        available: true,
        reason: null,
        previews: items.filter((item) => item.kind === "preview").map(toDto),
        environment: items.filter((item) => item.kind !== "preview").map(toDto),
        checkedAt,
    }
}

const ACTION_LABELS: Record<LocalDockerContainerAction, string> = { start: "levantar", stop: "derrubar", recreate: "recriar", delete: "apagar" }

async function commandFor(settings: LocalDockerSettings, item: Classified, action: LocalDockerContainerAction): Promise<string> {
    const { container, kind, preview } = item
    if (kind === "builder") {
        if (action === "start") return builderStartCommand(settings)
        if (action === "stop") return builderStopCommand(settings)
        if (action === "recreate") return builderEnsureCommand(settings, true)
        return builderDeleteCommand(settings)
    }
    if (action === "start") return startContainerCommand(settings, container.name)
    if (action === "stop") return stopContainerCommand(settings, container.name)
    if (kind === "alias") {
        if (action === "delete") return aliasDeleteCommand(settings, container.name)
        const alias = settings.aliases.find((candidate) => candidate.name === container.alias) ?? settings.aliases.find((candidate) => `${settings.aliasPrefix}${candidate.name}` === container.name)
        if (!alias) throw new DomainError(409, "Este apelido não está mais na configuração: apague o container ou rode o preparo do PC", "LOCAL_DOCKER_ALIAS_UNKNOWN")
        return aliasRunCommand(settings, alias)
    }
    // Prévia.
    if (action === "delete") return previewDeleteCommand(settings, preview!.composeProject)
    const workbench = await AgenticWorkbench.findById(preview!.workbenchId, { worktreePath: 1, port: 1 }).lean<{ worktreePath: string | null; port: number | null }>()
    if (!workbench?.worktreePath || !container.composeService) throw new DomainError(409, "Não foi possível recriar: a mesa da prévia não tem mais o worktree", "LOCAL_DOCKER_PREVIEW_UNKNOWN")
    return previewRecreateCommand(settings, { worktreePath: workbench.worktreePath, composeProject: preview!.composeProject, service: container.composeService, port: workbench.port ?? preview!.port })
}

/** Ação num container do PC. Apagar (com o ambiente) exige `confirm`. */
export async function runContainerAction(name: string, action: LocalDockerContainerAction, confirm: boolean, actorId: string, run: HostRunner = runOnHost): Promise<LocalDockerContainersDto> {
    const { settings } = settingsOf(await loadState())
    if (!(await isTunnelOpen(run))) throw new DomainError(409, "Abra o túnel antes de mexer nos containers do PC", "LOCAL_DOCKER_TUNNEL_CLOSED")
    if (action === "delete" && !confirm) throw new DomainError(409, "Apagar é destrutivo: confirme para continuar", "LOCAL_DOCKER_CONFIRM_REQUIRED")
    const item = (await snapshot(settings, run)).find((candidate) => candidate.container.name === name)
    if (!item) throw new DomainError(404, "Container não encontrado entre as prévias e o ambiente da Builder Machine", "LOCAL_DOCKER_CONTAINER_NOT_FOUND")
    const result = await run(await commandFor(settings, item, action), action === "recreate" || action === "delete" ? 300_000 : 60_000)
    if (result.exitCode !== 0) throw new DomainError(502, `Não foi possível ${ACTION_LABELS[action]} ${name}${lastLine(result.output) ? `: ${lastLine(result.output)}` : ""}`, "LOCAL_DOCKER_CONTAINER_FAILED")

    if (item.kind === "preview" && action === "delete") {
        // A mesa fica com a prévia fora do ar: sem repasse nem registro no PC (o próximo build da prévia reconstrói).
        await cancelForward(item.preview!.port, run)
        await LocalDockerPreview.deleteOne({ workbenchId: item.preview!.workbenchId })
        await publishLocalDocker("previews")
    }
    if (item.kind === "builder") {
        if (action === "recreate") await LocalDockerState.updateOne({ key: "default" }, { $set: { builderApplied: builderLimitsOf(settings) } }, { upsert: true })
        if (action === "delete") await LocalDockerState.updateOne({ key: "default" }, { $set: { builderApplied: null } }, { upsert: true })
    }
    await recordAudit({
        userId: actorId,
        entidade: LOCAL_DOCKER_AUDIT_ENTITY,
        entidadeId: `container:${name}`,
        acao: action === "delete" ? AcaoAuditoria.EXCLUIR : AcaoAuditoria.ATUALIZAR,
        depois: { acao: action, tipo: item.kind, ...(item.preview ? { projeto: item.preview.composeProject, mesa: item.preview.workbenchId } : {}) },
    })
    builderDebug.success(`Container ${name}: ${ACTION_LABELS[action]} concluído`)
    localDockerLog.info({ name, action, kind: item.kind }, "[local-docker] Ação em container do PC")
    await publishLocalDocker("containers")
    return listPcContainers(run)
}
