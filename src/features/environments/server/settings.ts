import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import { connectionProblem } from "@/features/local-docker/commands"
import { loadState as loadBuilderState, settingsOf as builderSettingsOf } from "@/features/local-docker/server/settings"
import { isTunnelOpen } from "@/features/local-docker/server/tunnel"
import { runOnHost, type HostRunner } from "@/features/local-docker/server/shell"
import type { DockerTarget } from "../commands"
import { ENVIRONMENTS_AUDIT_ENTITY, ENVIRONMENTS_EVENT, ENVIRONMENTS_FEATURE } from "../constants"
import { DEFAULT_ENVIRONMENTS_SETTINGS, environmentsSettingsSchema, type EnvironmentsSettings, type Machine } from "../schemas"
import type { EnvironmentsSettingsDto } from "../types"
import { EnvironmentsState, environmentsDb, type IEnvironmentsState } from "./models"

export const envLog = loggerFor({ feature: ENVIRONMENTS_FEATURE })
/** Comandos no host do OpenCode (o debug sai na integração Builder Machine, dona da conexão com o PC). */
export const runEnvHost: HostRunner = runOnHost

export type EnvironmentChange = "created" | "updated" | "deleted" | "deploy" | "status" | "settings"

/**
 * `{ id, change }` no `private-app` (payload mínimo) e, para ambiente de central, nos canais dos clientes
 * vinculados ao repositório (portal; `centralId` informado quando o registro já foi apagado).
 */
export async function publishEnvironment(id: string | null, change: EnvironmentChange, options: { centralId?: string | null } = {}): Promise<void> {
    await publishAppEvent(ENVIRONMENTS_EVENT, { id, change })
    if (!id || change === "settings") return
    try {
        const { publishPortalEnvironment } = await import("./portal")
        await publishPortalEnvironment(id, change, options.centralId)
    } catch (error) {
        envLog.warn({ err: error, id }, "[environments] Falha ao avisar o portal do cliente")
    }
}

export function settingsOf(state: Pick<IEnvironmentsState, "settings"> | null): EnvironmentsSettingsDto {
    if (!state?.settings) return { settings: DEFAULT_ENVIRONMENTS_SETTINGS, isDefault: true }
    const parsed = environmentsSettingsSchema.safeParse({ ...DEFAULT_ENVIRONMENTS_SETTINGS, ...state.settings })
    return parsed.success ? { settings: parsed.data, isDefault: false } : { settings: DEFAULT_ENVIRONMENTS_SETTINGS, isDefault: true }
}

export async function getEnvironmentsSettings(): Promise<EnvironmentsSettingsDto> {
    await environmentsDb()
    return settingsOf(await EnvironmentsState.findOne({ key: "default" }).lean<IEnvironmentsState>())
}

export async function loadEnvironmentsSettings(): Promise<EnvironmentsSettings> {
    return (await getEnvironmentsSettings()).settings
}

export async function saveEnvironmentsSettings(input: EnvironmentsSettings, actorId: string): Promise<EnvironmentsSettingsDto> {
    const before = await getEnvironmentsSettings()
    await EnvironmentsState.updateOne({ key: "default" }, { $set: { settings: input, updatedAt: new Date() } }, { upsert: true })
    await recordAudit({ userId: actorId, entidade: ENVIRONMENTS_AUDIT_ENTITY, entidadeId: "configuracao", acao: before.isDefault ? AcaoAuditoria.CRIAR : AcaoAuditoria.ATUALIZAR, antes: before.isDefault ? undefined : before.settings, depois: input })
    envLog.info(input, "[environments] Configuração salva")
    await publishEnvironment(null, "settings")
    return { settings: input, isDefault: false }
}

export interface MachineAccess {
    targets: Record<Machine, DockerTarget>
    pcAvailable: boolean
    pcReason: string | null
}

/** Docker de cada máquina e se o PC está alcançável (túnel do Builder Machine aberto). */
export async function machineAccess(run: HostRunner = runEnvHost): Promise<MachineAccess> {
    const builder = await loadBuilderState()
    const { settings } = builderSettingsOf(builder)
    const base = { context: settings.contextName, builder: settings.builderName }
    const targets: Record<Machine, DockerTarget> = { server: { machine: "server", ...base }, pc: { machine: "pc", ...base } }
    if (!builder?.publicKey) return { targets, pcAvailable: false, pcReason: "Configure o Builder Machine (Integrações › Builder Machine) para usar o PC" }
    const problem = connectionProblem(settings)
    if (problem) return { targets, pcAvailable: false, pcReason: problem }
    const open = await isTunnelOpen(run).catch(() => false)
    return { targets, pcAvailable: open, pcReason: open ? null : "Túnel do Builder Machine fechado: abra-o em Integrações › Builder Machine" }
}
