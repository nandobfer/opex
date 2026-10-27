import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { loggerFor } from "@/lib/logger"
import { publishAppEvent } from "@/lib/pusher/channels"
import { bootstrapScript, manualSteps, type ManualStep } from "../commands"
import { LOCAL_DOCKER_AUDIT_ENTITY, LOCAL_DOCKER_FEATURE_ID, LOCAL_DOCKER_UPDATED_EVENT } from "../constants"
import { DEFAULT_LOCAL_DOCKER_SETTINGS, localDockerSettingsSchema, type LocalDockerSettings } from "../schemas"
import type { LocalDockerSettingsDto } from "../types"
import { LocalDockerState, localDockerDb, type ILocalDockerState } from "./models"

export const localDockerLog = loggerFor({ feature: LOCAL_DOCKER_FEATURE_ID })

export async function publishLocalDocker(kind: "settings" | "status" | "previews" | "override" | "containers"): Promise<void> {
    await publishAppEvent(LOCAL_DOCKER_UPDATED_EVENT, { kind })
}

export async function loadState(): Promise<ILocalDockerState | null> {
    await localDockerDb()
    return LocalDockerState.findOne({ key: "default" }).lean<ILocalDockerState>()
}

/** Configuração salva (campos novos recebem o padrão; inválida = padrão). */
export function settingsOf(state: Pick<ILocalDockerState, "settings"> | null): { settings: LocalDockerSettings; isDefault: boolean } {
    if (!state?.settings) return { settings: DEFAULT_LOCAL_DOCKER_SETTINGS, isDefault: true }
    const parsed = localDockerSettingsSchema.safeParse({ ...DEFAULT_LOCAL_DOCKER_SETTINGS, ...state.settings })
    return parsed.success ? { settings: parsed.data, isDefault: false } : { settings: DEFAULT_LOCAL_DOCKER_SETTINGS, isDefault: true }
}

export async function loadSettings(): Promise<LocalDockerSettings> {
    return settingsOf(await loadState()).settings
}

function toDto(state: ILocalDockerState | null): LocalDockerSettingsDto {
    const { settings, isDefault } = settingsOf(state)
    const prepare = state?.lastPrepare
    return {
        settings,
        isDefault,
        key: { configured: Boolean(state?.publicKey), source: state?.publicKey ? (state.keySource ?? "generated") : null, fingerprint: state?.keyFingerprint ?? null },
        lastPrepare: prepare ? { ok: prepare.ok, trigger: prepare.trigger, steps: prepare.steps, at: new Date(prepare.at).toISOString() } : null,
        updatedAt: state?.updatedAt ? state.updatedAt.toISOString() : null,
    }
}

export async function getLocalDockerSettings(): Promise<LocalDockerSettingsDto> {
    return toDto(await loadState())
}

export async function saveLocalDockerSettings(input: LocalDockerSettings, actorId: string): Promise<LocalDockerSettingsDto> {
    const before = await loadState()
    const previous = settingsOf(before)
    await LocalDockerState.updateOne({ key: "default" }, { $set: { settings: input, updatedAt: new Date(), updatedBy: actorId } }, { upsert: true })
    await recordAudit({
        userId: actorId,
        entidade: LOCAL_DOCKER_AUDIT_ENTITY,
        entidadeId: "configuracao",
        acao: previous.isDefault ? AcaoAuditoria.CRIAR : AcaoAuditoria.ATUALIZAR,
        antes: previous.isDefault ? undefined : previous.settings,
        depois: input,
    })
    localDockerLog.info({ mode: input.mode, useWhenOpen: input.useWhenOpen }, "[local-docker] Configuração salva")
    await publishLocalDocker("settings")
    // Túnel aberto: só os containers de ambiente novos ou alterados sobem/são recriados, sem esperar.
    void import("./machine").then(({ reconcileAfterSave }) => reconcileAfterSave(actorId)).catch((error: unknown) => localDockerLog.warn({ err: error }, "[local-docker] Falha ao aplicar a configuração no PC"))
    return getLocalDockerSettings()
}

export async function getBootstrapScript(options: { mirrored: boolean }): Promise<string> {
    const state = await loadState()
    if (!state?.publicKey) throw new DomainError(409, "Gere ou insira a chave do servidor antes de gerar o script", "LOCAL_DOCKER_NO_KEY")
    return bootstrapScript(settingsOf(state).settings, state.publicKey, options)
}

/** Passo a passo manual (mesmo conteúdo do script), com a chave pública quando já existe. */
export async function getManualSteps(options: { mirrored: boolean }): Promise<ManualStep[]> {
    const state = await loadState()
    return manualSteps(settingsOf(state).settings, state?.publicKey ?? null, options)
}
