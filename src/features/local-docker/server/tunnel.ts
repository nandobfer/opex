import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { cancelForwardCommand, checkTunnelCommand, closeTunnelCommand, connectionProblem, forwardPortCommand, machineInfoCommand, openTunnelCommand, parseMachineInfo, remoteCommand, removeComposeOverrideCommand, teardownCommand } from "../commands"
import { LOCAL_DOCKER_AUDIT_ENTITY } from "../constants"
import type { LocalDockerSettings } from "../schemas"
import type { LocalDockerMachineInfo, LocalDockerPreviewDto, LocalDockerStatusDto } from "../types"
import { ensureKeyOnHost } from "./key"
import { LocalDockerPreview, LocalDockerState, localDockerDb, type ILocalDockerPreview } from "./models"
import { loadState, localDockerLog, publishLocalDocker, settingsOf } from "./settings"
import { lastLine, runOnHost, type HostRunner } from "./shell"

/**
 * Túnel de dados do PC: uma conexão mestra SSH iniciada pelo servidor que traz o socket do Docker do
 * PC para o host (contexto do Docker) e, sob demanda, a porta de cada prévia publicada no PC.
 */

export async function isTunnelOpen(run: HostRunner = runOnHost): Promise<boolean> {
    return (await run(checkTunnelCommand(), 10_000)).exitCode === 0
}

export async function machineInfo(settings: LocalDockerSettings, run: HostRunner = runOnHost): Promise<LocalDockerMachineInfo | null> {
    const result = await run(machineInfoCommand(settings), 15_000)
    return result.exitCode === 0 ? parseMachineInfo(result.output) : null
}

export async function isReachable(settings: LocalDockerSettings, run: HostRunner = runOnHost): Promise<boolean> {
    if (connectionProblem(settings)) return false
    return (await run(remoteCommand(settings, "true"), 15_000)).exitCode === 0
}

function previewDto(item: ILocalDockerPreview): LocalDockerPreviewDto {
    return { workbenchId: item.workbenchId, composeProject: item.composeProject, port: item.port, pendingTeardown: item.pendingTeardown }
}

export async function listLocalPreviews(): Promise<LocalDockerPreviewDto[]> {
    await localDockerDb()
    const items = await LocalDockerPreview.find({}).sort({ createdAt: 1 }).lean<ILocalDockerPreview[]>()
    return items.map(previewDto)
}

export async function getLocalDockerStatus(run: HostRunner = runOnHost): Promise<LocalDockerStatusDto> {
    const state = await loadState()
    const { settings } = settingsOf(state)
    let error: string | null = connectionProblem(settings)
    const tunnelOpen = await isTunnelOpen(run).catch((cause: unknown) => {
        error = cause instanceof Error ? cause.message : String(cause)
        return false
    })
    const machine = tunnelOpen ? await machineInfo(settings, run).catch(() => null) : null
    if (tunnelOpen && !machine) error = "O túnel está aberto, mas o Docker do PC não respondeu"
    const reachable = tunnelOpen || (error === null && (await isReachable(settings, run).catch(() => false)))
    if (!reachable && !error) error = settings.mode === "reverse" ? `O PC não respondeu pelo túnel de controle (porta ${settings.controlPort}): confira o serviço no WSL` : `O PC não respondeu em ${settings.pcHost}:${settings.pcSshPort}`
    await LocalDockerState.updateOne({ key: "default" }, { $set: { lastSeenOpen: tunnelOpen, lastCheckAt: new Date() } }, { upsert: true })
    return {
        reachable,
        tunnelOpen,
        wantOpen: Boolean(state?.wantOpen),
        machine,
        routesToLocal: tunnelOpen && Boolean(machine) && settings.useWhenOpen,
        previews: await listLocalPreviews(),
        error: tunnelOpen && machine ? null : error,
        checkedAt: new Date().toISOString(),
    }
}

/** Repassa a porta de uma prévia do PC para o servidor (na conexão mestra). */
export async function forwardPort(port: number, run: HostRunner = runOnHost): Promise<void> {
    const result = await run(forwardPortCommand(port), 15_000)
    if (result.exitCode !== 0) throw new DomainError(502, `Não foi possível repassar a porta ${port} do PC para o servidor${lastLine(result.output) ? `: ${lastLine(result.output)}` : ""}`, "LOCAL_DOCKER_FORWARD_FAILED")
}

export async function cancelForward(port: number, run: HostRunner = runOnHost): Promise<void> {
    await run(cancelForwardCommand(port), 15_000)
}

/** Remove os containers de uma prévia no PC (túnel aberto) e o registro dela. */
async function teardownNow(settings: LocalDockerSettings, preview: Pick<ILocalDockerPreview, "workbenchId" | "composeProject" | "port">, run: HostRunner): Promise<void> {
    const result = await run(teardownCommand(settings.contextName, preview.composeProject), 120_000)
    if (result.exitCode !== 0) throw new Error(`Não foi possível derrubar a prévia ${preview.composeProject} no PC${lastLine(result.output) ? `: ${lastLine(result.output)}` : ""}`)
    await cancelForward(preview.port, run)
    await run(removeComposeOverrideCommand(preview.composeProject), 15_000)
    await LocalDockerPreview.deleteOne({ workbenchId: preview.workbenchId })
}

/**
 * Derruba a prévia de uma mesa no PC. Com o túnel fechado, ela fica marcada e sai quando o túnel
 * reabrir. Devolve `"done"` ou `"pending"` (`"none"` = a mesa não tem prévia registrada no PC).
 */
export async function teardownLocalPreview(workbenchId: string, run: HostRunner = runOnHost): Promise<"done" | "pending" | "none"> {
    await localDockerDb()
    const preview = await LocalDockerPreview.findOne({ workbenchId }).lean<ILocalDockerPreview>()
    if (!preview) return "none"
    const settings = settingsOf(await loadState()).settings
    if (!(await isTunnelOpen(run))) {
        await LocalDockerPreview.updateOne({ workbenchId }, { $set: { pendingTeardown: true } })
        localDockerLog.warn({ workbenchId, composeProject: preview.composeProject }, "[local-docker] Túnel fechado: a prévia no PC sai quando ele reabrir")
        await publishLocalDocker("previews")
        return "pending"
    }
    await teardownNow(settings, preview, run)
    localDockerLog.info({ workbenchId, composeProject: preview.composeProject }, "[local-docker] Prévia derrubada no PC")
    await publishLocalDocker("previews")
    return "done"
}

/** Depois de abrir: repassa as portas das prévias que estão no PC e derruba as pendentes. */
async function restorePreviews(settings: LocalDockerSettings, run: HostRunner): Promise<string[]> {
    const warnings: string[] = []
    for (const preview of await LocalDockerPreview.find({}).lean<ILocalDockerPreview[]>()) {
        try {
            if (preview.pendingTeardown) await teardownNow(settings, preview, run)
            else await forwardPort(preview.port, run)
        } catch (error) {
            warnings.push(error instanceof Error ? error.message : String(error))
        }
    }
    return warnings
}

export async function openTunnel(actorId: string | null, run: HostRunner = runOnHost): Promise<LocalDockerStatusDto> {
    const state = await loadState()
    const { settings } = settingsOf(state)
    const problem = connectionProblem(settings)
    if (problem) throw new DomainError(400, problem, "LOCAL_DOCKER_INCOMPLETE")
    if (!state?.publicKey) throw new DomainError(409, "Gere ou insira a chave do servidor e rode o script de preparo no PC antes de abrir o túnel", "LOCAL_DOCKER_NO_KEY")
    await ensureKeyOnHost(run)
    const result = await run(openTunnelCommand(settings), 40_000)
    if (result.exitCode !== 0) throw new DomainError(502, `Não foi possível abrir o túnel com o PC${lastLine(result.output) ? `: ${lastLine(result.output)}` : ""}`, "LOCAL_DOCKER_OPEN_FAILED")
    await LocalDockerState.updateOne({ key: "default" }, { $set: { wantOpen: true } }, { upsert: true })
    const warnings = await restorePreviews(settings, run)
    for (const warning of warnings) localDockerLog.warn({ warning }, "[local-docker] Falha ao restaurar prévia do PC")
    if (actorId) await recordAudit({ userId: actorId, entidade: LOCAL_DOCKER_AUDIT_ENTITY, entidadeId: "tunel", acao: AcaoAuditoria.ATUALIZAR, antes: { aberto: false }, depois: { aberto: true } })
    localDockerLog.info({ automatic: !actorId }, "[local-docker] Túnel aberto")
    await publishLocalDocker("status")
    return getLocalDockerStatus(run)
}

export async function closeTunnel(actorId: string, confirm: boolean, run: HostRunner = runOnHost): Promise<LocalDockerStatusDto> {
    await localDockerDb()
    const live = await LocalDockerPreview.countDocuments({ pendingTeardown: false })
    if (live > 0 && !confirm) throw new DomainError(409, `Há ${live} prévia(s) no ar no PC: confirme para fechar o túnel (elas ficam fora do ar até reabrir)`, "LOCAL_DOCKER_PREVIEWS_RUNNING")
    await run(closeTunnelCommand(), 15_000)
    await LocalDockerState.updateOne({ key: "default" }, { $set: { wantOpen: false, lastSeenOpen: false } }, { upsert: true })
    await recordAudit({ userId: actorId, entidade: LOCAL_DOCKER_AUDIT_ENTITY, entidadeId: "tunel", acao: AcaoAuditoria.ATUALIZAR, antes: { aberto: true }, depois: { aberto: false, previasNoPc: live } })
    localDockerLog.info({ previews: live }, "[local-docker] Túnel fechado")
    await publishLocalDocker("status")
    return getLocalDockerStatus(run)
}
