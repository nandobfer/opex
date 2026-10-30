import { clientActorFor, type ClientActor } from "@/features/auth/server/context"
import { OPEX_CLIENT_CONTEXT_TOOL } from "@/features/opex-agent/client-tools"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { OpexSession } from "@/lib/db/models/Opex"
import { OrcamentoClient, type IOrcamentoClientMaddoxAgent } from "@/lib/db/models/Orcamento"
import { loggerFor } from "@/lib/logger"
import { clientChannel } from "@/lib/pusher/channel-names"
import { publishAppEvent, publishToChannels } from "@/lib/pusher/channels"
import { MADDOX_CLIENT_TOOL_NAMES, enabledMaddoxClientToolNames } from "../catalog"
import { MADDOX_CLIENT_AUDIT_ENTITY, MADDOX_CLIENT_CONFIG_EVENT, MADDOX_SETTINGS_EVENT } from "../constants"
import type { ClientMaddoxAgentConfigInput } from "../schemas"
import type { MaddoxClientAgentConfigDto, MaddoxClientStatusDto } from "../types"
import { loadMaddoxSettings, maddoxAvailability, maddoxModelLabel } from "./settings"

/**
 * Configuração do Agente Maddox **por cliente** (SOMENTE servidor), em `orcamento_clients.maddoxAgent`.
 * Diferente do Agente Opex, o padrão é **desligado**: clientes existentes ficam sem o Maddox até o dono
 * ligá-lo. As ferramentas guardadas são as **desligadas** (ferramenta nova entra ligada).
 */

const log = loggerFor({ module: "maddox-agent" })

export interface ClientMaddoxConfig {
    enabled: boolean
    disabledTools: string[]
}

export const DEFAULT_CLIENT_MADDOX_CONFIG: ClientMaddoxConfig = { enabled: false, disabledTools: [] }

/** Ausente = desligado; nomes fora do catálogo do Maddox são ignorados; o contexto nunca é desligado. */
export function normalizeClientMaddoxConfig(value: Partial<IOrcamentoClientMaddoxAgent> | null | undefined): ClientMaddoxConfig {
    return {
        enabled: value?.enabled === true,
        disabledTools: [...new Set((Array.isArray(value?.disabledTools) ? value.disabledTools : []).filter((name) => MADDOX_CLIENT_TOOL_NAMES.includes(name) && name !== OPEX_CLIENT_CONTEXT_TOOL))],
    }
}

export async function loadClientMaddoxConfig(clientId: string): Promise<ClientMaddoxConfig> {
    await dbConnect()
    const doc = await OrcamentoClient.findById(clientId).select({ maddoxAgent: 1 }).lean<{ maddoxAgent?: IOrcamentoClientMaddoxAgent }>()
    if (!doc) throw new DomainError(404, "Cliente não encontrado", "CLIENT_NOT_FOUND")
    return normalizeClientMaddoxConfig(doc.maddoxAgent)
}

export function clientMaddoxConfigDto(config: ClientMaddoxConfig): MaddoxClientAgentConfigDto {
    return { enabled: config.enabled, enabledTools: enabledMaddoxClientToolNames(config.disabledTools, true) }
}

export async function getClientMaddoxConfig(clientId: string): Promise<MaddoxClientAgentConfigDto> {
    return clientMaddoxConfigDto(await loadClientMaddoxConfig(clientId))
}

/**
 * Salva a seleção do dono (auditada) e avisa o app e o portal do cliente. Desligar o Maddox interrompe
 * os turnos em andamento das sessões daquele cliente.
 */
export async function saveClientMaddoxConfig(clientId: string, input: ClientMaddoxAgentConfigInput, actorId: string): Promise<MaddoxClientAgentConfigDto> {
    const before = await loadClientMaddoxConfig(clientId)
    const invalid = input.enabledTools.filter((name) => !MADDOX_CLIENT_TOOL_NAMES.includes(name))
    if (invalid.length) throw new DomainError(400, `Ferramenta desconhecida: ${invalid.slice(0, 5).join(", ")}`, "MADDOX_TOOL_UNKNOWN")
    const enabled = new Set(input.enabledTools)
    const next: ClientMaddoxConfig = {
        enabled: input.enabled,
        disabledTools: MADDOX_CLIENT_TOOL_NAMES.filter((name) => name !== OPEX_CLIENT_CONTEXT_TOOL && !enabled.has(name)),
    }
    await dbConnect()
    await OrcamentoClient.updateOne({ _id: clientId }, { $set: { maddoxAgent: next } })
    await recordAudit({
        userId: actorId,
        entidade: MADDOX_CLIENT_AUDIT_ENTITY,
        entidadeId: clientId,
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { ativado: before.enabled, ferramentas: enabledMaddoxClientToolNames(before.disabledTools, true).length },
        depois: { ativado: next.enabled, ferramentas: enabledMaddoxClientToolNames(next.disabledTools, true).length },
    })
    if (before.enabled && !next.enabled) await interruptClientTurns(clientId)
    const payload = { clientId }
    await Promise.all([publishAppEvent(MADDOX_CLIENT_CONFIG_EVENT, payload), publishToChannels([clientChannel(clientId)], MADDOX_CLIENT_CONFIG_EVENT, payload)])
    return clientMaddoxConfigDto(next)
}

/** Para os turnos do Maddox em andamento nas sessões do cliente (o agente foi desligado). */
async function interruptClientTurns(clientId: string): Promise<void> {
    const sessions = await OpexSession.find({ clientId, agent: "maddox", status: { $in: ["running", "awaiting_confirmation"] } }).select({ _id: 1 }).lean<{ _id: unknown }[]>()
    if (!sessions.length) return
    const { abortTurn } = await import("@/features/opex-agent/server/hub")
    for (const session of sessions) abortTurn(String(session._id), "O Agente Maddox foi desativado para este cliente")
    log.info({ clientId, sessions: sessions.length }, "[maddox] turnos interrompidos: agente desligado para o cliente")
}

/** A configuração geral mudou (cor, modelo, disponibilidade): o portal dos clientes com o Maddox relê. */
export async function publishMaddoxSettingsToClients(): Promise<void> {
    await dbConnect()
    const clients = await OrcamentoClient.find({ "maddoxAgent.enabled": true }).select({ _id: 1 }).lean<{ _id: unknown }[]>()
    if (!clients.length) return
    await publishToChannels(
        clients.map((client) => clientChannel(String(client._id))),
        MADDOX_SETTINGS_EVENT,
        {},
    ).catch((error: unknown) => log.warn({ err: error instanceof Error ? error.message : error }, "[maddox] aviso de configuração ao portal falhou"))
}

/** Ferramentas do portal liberadas agora para o ator (configuração do cliente + papel). */
export async function enabledMaddoxClientToolNamesFor(actor: ClientActor): Promise<string[]> {
    const config = await loadClientMaddoxConfig(String(actor.client._id))
    return enabledMaddoxClientToolNames(config.disabledTools, actor.isAdmin)
}

/** Recusa o uso do Maddox quando ele não está ligado para o cliente (403). */
export async function assertClientMaddoxEnabled(actor: ClientActor): Promise<ClientMaddoxConfig> {
    const config = await loadClientMaddoxConfig(String(actor.client._id))
    if (!config.enabled) throw new DomainError(403, "O Agente Maddox não está ativo para este cliente.", "MADDOX_CLIENT_DISABLED")
    return config
}

/**
 * Revalida, imediatamente antes de cada ferramenta do Opex, que o ator continua no cliente (ativo,
 * vinculado), que o Maddox segue ligado e que a ferramenta segue liberada para o papel. Devolve o
 * ator atualizado (o papel pode ter mudado no meio do turno).
 */
export async function assertClientMaddoxToolAllowed(toolName: string, actor: ClientActor): Promise<ClientActor> {
    const fresh = await clientActorFor(actor.userId, String(actor.client._id))
    const config = await assertClientMaddoxEnabled(fresh)
    if (!enabledMaddoxClientToolNames(config.disabledTools, fresh.isAdmin).includes(toolName)) throw new DomainError(403, "Esta ferramenta foi desativada para o cliente.", "MADDOX_TOOL_DISABLED")
    return fresh
}

/** Situação do Maddox para o portal: ativação, disponibilidade, modelo padrão, cor e limites de arquivo. */
export async function clientMaddoxStatus(actor: ClientActor): Promise<MaddoxClientStatusDto> {
    const config = await loadClientMaddoxConfig(String(actor.client._id))
    const { settings } = await loadMaddoxSettings()
    const availability = config.enabled ? await maddoxAvailability(settings) : { available: false, reason: "O Agente Maddox não está ativo para este cliente." }
    return {
        enabled: config.enabled,
        available: availability.available,
        reason: availability.reason ?? null,
        modelLabel: maddoxModelLabel(settings.main.model, settings.main.variant),
        model: settings.main.model,
        variant: settings.main.variant,
        color: settings.color,
        files: settings.files,
    }
}
