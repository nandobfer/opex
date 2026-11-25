
import { randomBytes } from "node:crypto"
import { DomainError } from "@/lib/api/route"
import { getIntegrationConfig } from "@/lib/integrations/config"
import {
    connectionStateOf,
    EVOLUTION_INTEGRATION_ID,
    EVOLUTION_QR_LIMIT,
    EVOLUTION_QR_TTL_MS,
    EVOLUTION_WEBHOOK_EVENTS,
    EVOLUTION_WEBHOOK_SECRET_HEADER,
    jidNumber,
} from "../constants"
import { defaultWebhookUrl } from "../prefill"
import type { ConnectInstanceInput, InstanceOptionsInput } from "../schemas"
import type { EvolutionInstanceDto, EvolutionInstanceOptionsDto, EvolutionInstancesDto, EvolutionLastEventDto, EvolutionWebhookDto } from "../types"
import { evolution, EvolutionError, toDomainError } from "./client"
import { EvolutionInstanceState, evolutionDb, type IEvolutionInstanceState, type IEvolutionLastEvent } from "./models"
import { AcaoAuditoria, auditEvolution, evolutionLog, publishEvolution, saveEvolutionFields } from "./shared"

/**
 * Instâncias da Evolution: criar/escolher, estado ao vivo, pareamento por QR code ou código, perfil,
 * reiniciar/desconectar/excluir, opções e o registro do webhook (automático ao conectar).
 */

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

const lastEventDto = (event: IEvolutionLastEvent | null | undefined): EvolutionLastEventDto | null =>
    event ? { at: event.at.toISOString(), event: event.event, ok: event.ok, message: event.message } : null

export async function evolutionConfig() {
    return getIntegrationConfig(EVOLUTION_INTEGRATION_ID)
}

/** Instância em uso: a padrão da integração (erro 409 sem ela). */
export async function defaultInstanceName(): Promise<string> {
    const config = await evolutionConfig()
    const name = config.defaultInstance?.trim()
    if (!name) throw new DomainError(409, "Escolha ou crie a instância na aba Instância", "EVOLUTION_NO_INSTANCE")
    return name
}

async function loadState(name: string): Promise<IEvolutionInstanceState | null> {
    await evolutionDb()
    return EvolutionInstanceState.findById(name).lean<IEvolutionInstanceState>()
}

export async function patchState(name: string, $set: Partial<Omit<IEvolutionInstanceState, "_id">>): Promise<void> {
    await evolutionDb()
    await EvolutionInstanceState.updateOne({ _id: name }, { $set: { ...$set, updatedAt: new Date() } }, { upsert: true })
}

export async function listInstances(): Promise<EvolutionInstancesDto> {
    const config = await evolutionConfig()
    try {
        const instances = await evolution.fetchInstances()
        return {
            defaultInstance: config.defaultInstance?.trim() || null,
            instances: instances.map((item) => ({
                name: item.name,
                state: connectionStateOf(item.connectionStatus),
                profileName: item.profileName ?? null,
                number: item.ownerJid ? jidNumber(item.ownerJid) : (item.number ?? null),
            })),
            error: null,
        }
    } catch (error) {
        if (error instanceof EvolutionError && error.code === "NOT_CONFIGURED") return { defaultInstance: null, instances: [], error: error.message }
        return { defaultInstance: config.defaultInstance?.trim() || null, instances: [], error: messageOf(error) }
    }
}

export async function selectInstance(name: string, actorId: string): Promise<EvolutionInstancesDto> {
    const list = await listInstances()
    if (!list.instances.some((item) => item.name === name)) throw new DomainError(404, `A instância "${name}" não existe na Evolution`, "EVOLUTION_INSTANCE_NOT_FOUND")
    await saveEvolutionFields({ publicValues: { defaultInstance: name } }, actorId)
    await publishEvolution("instances", name)
    return { ...list, defaultInstance: name }
}

export async function createInstance(name: string, actorId: string): Promise<EvolutionInstancesDto> {
    try {
        await evolution.createInstance(name, { syncFullHistory: true })
    } catch (error) {
        toDomainError(error)
    }
    await patchState(name, { state: "close", qr: null, qrLimitReached: false })
    await saveEvolutionFields({ publicValues: { defaultInstance: name } }, actorId)
    await auditEvolution(actorId, name, AcaoAuditoria.CRIAR, { instancia: name })
    evolutionLog.info({ instance: name }, "[evolution] Instância criada")
    await publishEvolution("instances", name)
    return listInstances()
}

function profileOf(state: IEvolutionInstanceState | null) {
    if (!state?.ownerJid && !state?.profileName) return null
    return { name: state.profileName ?? null, number: state.ownerJid ? jidNumber(state.ownerJid) : null, pictureUrl: state.profilePictureUrl ?? null }
}

function toDto(name: string, state: IEvolutionInstanceState | null, managerUrl: string | null, error: string | null): EvolutionInstanceDto {
    const raw = state?.state ?? "close"
    const connection = connectionStateOf(raw)
    const qr = connection === "waiting" && state?.qr ? state.qr : null
    return {
        name,
        state: connection,
        rawState: raw,
        profile: connection === "connected" ? profileOf(state) : null,
        qr: qr
            ? {
                  mode: qr.mode,
                  base64: qr.base64,
                  pairingCode: qr.pairingCode,
                  count: qr.count,
                  limit: EVOLUTION_QR_LIMIT,
                  generatedAt: qr.generatedAt.toISOString(),
                  expiresAt: new Date(qr.generatedAt.getTime() + EVOLUTION_QR_TTL_MS).toISOString(),
              }
            : null,
        qrLimitReached: state?.qrLimitReached === true && connection === "disconnected",
        lastEvent: lastEventDto(state?.lastEvent),
        webhookRegisteredAt: state?.webhookRegisteredAt?.toISOString() ?? null,
        webhookError: state?.webhookError ?? null,
        managerUrl,
        error,
    }
}

/** Estado ao vivo: consulta a Evolution (estado + perfil) e junta com o QR/último evento guardados. */
export async function getInstance(name: string): Promise<EvolutionInstanceDto> {
    const config = await evolutionConfig()
    const managerUrl = config.publicUrl ? `${config.publicUrl.replace(/\/+$/, "")}/manager` : null
    let error: string | null = null
    try {
        const [state, instances] = await Promise.all([evolution.connectionState(name), evolution.fetchInstances()])
        const info = instances.find((item) => item.name === name)
        const raw = state.instance.state ?? info?.connectionStatus ?? "close"
        await patchState(name, {
            state: raw,
            ...(info ? { ownerJid: info.ownerJid ?? null, profileName: info.profileName ?? null, profilePictureUrl: info.profilePicUrl ?? null } : {}),
            ...(raw === "open" ? { qr: null, qrLimitReached: false } : {}),
        })
    } catch (caught) {
        error = messageOf(caught)
    }
    return toDto(name, await loadState(name), managerUrl, error)
}

/** Garante o segredo do webhook (gerado no servidor, cifrado; nunca exibido). */
export async function ensureWebhookSecret(actorId: string): Promise<string> {
    const config = await evolutionConfig()
    if (config.webhookSecret) return config.webhookSecret
    const secret = randomBytes(32).toString("base64url")
    await saveEvolutionFields({ secrets: { webhookSecret: { action: "set", value: secret } } }, actorId)
    return secret
}

export async function webhookUrl(): Promise<string> {
    const config = await evolutionConfig()
    return config.webhookUrl?.trim() || defaultWebhookUrl(process.env.PORT)
}

/** Registra o webhook do Opex na instância (`/webhook/set/{instance}`), com o segredo no header. */
export async function registerWebhook(name: string, actorId: string): Promise<EvolutionWebhookDto> {
    const secret = await ensureWebhookSecret(actorId)
    const url = await webhookUrl()
    try {
        await evolution.setWebhook(name, { url, events: EVOLUTION_WEBHOOK_EVENTS, headers: { [EVOLUTION_WEBHOOK_SECRET_HEADER]: secret } })
        await patchState(name, { webhookRegisteredAt: new Date(), webhookError: null })
        await auditEvolution(actorId, name, AcaoAuditoria.ATUALIZAR, { webhook: url, eventos: EVOLUTION_WEBHOOK_EVENTS.length })
        evolutionLog.info({ instance: name, url }, "[evolution] Webhook registrado na instância")
    } catch (error) {
        await patchState(name, { webhookError: messageOf(error) })
        await publishEvolution("webhook", name)
        toDomainError(error)
    }
    await publishEvolution("webhook", name)
    return getWebhook(name)
}

export async function saveWebhookUrl(url: string, actorId: string): Promise<EvolutionWebhookDto> {
    await saveEvolutionFields({ publicValues: { webhookUrl: url } }, actorId)
    const config = await evolutionConfig()
    const name = config.defaultInstance?.trim()
    return name ? registerWebhook(name, actorId) : getWebhook(null)
}

export async function getWebhook(name: string | null): Promise<EvolutionWebhookDto> {
    const config = await evolutionConfig()
    const url = await webhookUrl()
    const state = name ? await loadState(name) : null
    let registered: EvolutionWebhookDto["registered"] = null
    let error: string | null = null
    if (name) {
        try {
            const found = await evolution.findWebhook(name)
            registered = found ? { enabled: found.enabled === true, url: found.url ?? null, events: found.events ?? [] } : null
        } catch (caught) {
            error = messageOf(caught)
        }
    }
    const events = [...EVOLUTION_WEBHOOK_EVENTS]
    return {
        instance: name,
        url: config.webhookUrl?.trim() || null,
        defaultUrl: defaultWebhookUrl(process.env.PORT),
        secretConfigured: Boolean(config.webhookSecret),
        events,
        registered,
        matches: Boolean(registered?.enabled && registered.url === url && events.every((event) => registered?.events.includes(event))),
        lastEvent: lastEventDto(state?.lastEvent),
        webhookRegisteredAt: state?.webhookRegisteredAt?.toISOString() ?? null,
        webhookError: state?.webhookError ?? null,
        error,
    }
}

/** Conecta por QR code ou por código de pareamento. Registra o webhook antes (registro automático). */
export async function connectInstance(name: string, input: ConnectInstanceInput, actorId: string): Promise<EvolutionInstanceDto> {
    try {
        await registerWebhook(name, actorId)
    } catch (error) {
        // Sem webhook a tela não recebe o QR renovado, mas a conexão ainda pode ser feita: segue e avisa.
        evolutionLog.warn({ err: error, instance: name }, "[evolution] Webhook não registrado antes de conectar")
    }
    try {
        const result = await evolution.connect(name, input.mode === "pairing" ? input.number : undefined)
        await patchState(name, {
            state: "connecting",
            qrLimitReached: false,
            qr: { mode: input.mode, base64: result.base64 ?? null, code: result.code ?? null, pairingCode: result.pairingCode ?? null, count: result.count ?? 1, generatedAt: new Date() },
        })
    } catch (error) {
        toDomainError(error)
    }
    await auditEvolution(actorId, name, AcaoAuditoria.EXECUTAR, { acao: "conectar", modo: input.mode })
    await publishEvolution("qrcode", name)
    return getInstance(name)
}

type InstanceAction = "restart" | "logout" | "delete"
const ACTION_LABEL: Record<InstanceAction, string> = { restart: "reiniciar", logout: "desconectar", delete: "excluir" }

export async function runInstanceAction(name: string, action: InstanceAction, actorId: string): Promise<EvolutionInstanceDto | { deleted: true }> {
    try {
        if (action === "restart") await evolution.restart(name)
        else if (action === "logout") await evolution.logout(name)
        else await evolution.deleteInstance(name)
    } catch (error) {
        toDomainError(error)
    }
    await auditEvolution(actorId, name, action === "delete" ? AcaoAuditoria.EXCLUIR : AcaoAuditoria.EXECUTAR, { acao: ACTION_LABEL[action] })
    evolutionLog.info({ instance: name, action }, "[evolution] Ação na instância")
    if (action === "delete") {
        await evolutionDb()
        await EvolutionInstanceState.deleteOne({ _id: name })
        const config = await evolutionConfig()
        if (config.defaultInstance?.trim() === name) await saveEvolutionFields({ publicValues: { defaultInstance: "" } }, actorId)
        await publishEvolution("instances", name)
        return { deleted: true }
    }
    await patchState(name, action === "logout" ? { state: "close", qr: null, ownerJid: null, profileName: null, profilePictureUrl: null } : {})
    await publishEvolution("connection", name)
    return getInstance(name)
}

export async function getInstanceOptions(name: string): Promise<EvolutionInstanceOptionsDto> {
    let found: Awaited<ReturnType<typeof evolution.findSettings>>
    try {
        found = await evolution.findSettings(name)
    } catch (error) {
        toDomainError(error)
    }
    return {
        rejectCall: found?.rejectCall === true,
        groupsIgnore: found?.groupsIgnore === true,
        alwaysOnline: found?.alwaysOnline === true,
        syncFullHistory: found?.syncFullHistory === true,
        readStatus: found?.readStatus === true,
        readMessages: false,
    }
}

/** Grava as opções; `readMessages` sempre desligada (o Agente Secretário decide a leitura). */
export async function saveInstanceOptions(name: string, input: InstanceOptionsInput, actorId: string): Promise<EvolutionInstanceOptionsDto> {
    const before = await getInstanceOptions(name).catch(() => null)
    try {
        await evolution.setSettings(name, { ...input, readMessages: false })
    } catch (error) {
        toDomainError(error)
    }
    await auditEvolution(actorId, name, AcaoAuditoria.ATUALIZAR, { opcoes: input }, before ? { opcoes: before } : undefined)
    await publishEvolution("settings", name)
    return { ...input, readMessages: false }
}
