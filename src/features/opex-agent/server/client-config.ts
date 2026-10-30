import { clientActorFor, type ClientActor } from "@/features/auth/server/context"
import { DomainError } from "@/lib/api/route"
import { getAiProvider } from "@/lib/ai/providers"
import { AcaoAuditoria, dbConnect, recordAudit } from "@/lib/db"
import { OrcamentoClient, type IOrcamentoClientOpexAgent } from "@/lib/db/models/Orcamento"
import { clientChannel } from "@/lib/pusher/channel-names"
import { publishAppEvent, publishToChannels } from "@/lib/pusher/channels"
import { OPEX_CLIENT_AUDIT_ENTITY, OPEX_CLIENT_CONFIG_EVENT } from "../constants"
import { enabledOpexClientToolNames, OPEX_CLIENT_CONTEXT_TOOL, OPEX_CLIENT_OPT_IN_TOOLS, OPEX_CLIENT_TOOL_NAMES } from "../client-tools"
import type { ClientOpexAgentConfigInput } from "../schemas"
import type { OpexClientAgentConfigDto, OpexClientStatusDto } from "../types"
import { loadOpexSettings, opexAvailability } from "./settings"

/**
 * Configuração do Agente Opex **por cliente** (SOMENTE servidor), salva em `orcamento_clients.opexAgent`.
 * Sem configuração, vale o padrão: ligado e com todas as ferramentas do portal. A configuração guarda
 * as ferramentas **desligadas** para que uma ferramenta nova já entre ligada; as "desligadas por
 * padrão" (`optIn`, ex.: Jobs agendados) ficam em `enabledOptInTools` quando o dono as liga.
 */

export interface ClientOpexConfig {
    enabled: boolean
    disabledTools: string[]
    enabledOptInTools: string[]
    /** MCPs liberados para o cliente (desligados por padrão). */
    enabledMcpServers: string[]
}

export const DEFAULT_CLIENT_OPEX_CONFIG: ClientOpexConfig = { enabled: true, disabledTools: [], enabledOptInTools: [], enabledMcpServers: [] }

/** Normaliza o que está gravado: ausente = padrão; nomes fora do catálogo são ignorados. */
export function normalizeClientOpexConfig(value: IOrcamentoClientOpexAgent | null | undefined): ClientOpexConfig {
    return {
        enabled: value?.enabled !== false,
        disabledTools: [...new Set((value?.disabledTools ?? []).filter((name) => OPEX_CLIENT_TOOL_NAMES.includes(name) && name !== OPEX_CLIENT_CONTEXT_TOOL && !OPEX_CLIENT_OPT_IN_TOOLS.includes(name)))],
        enabledOptInTools: [...new Set((value?.enabledOptInTools ?? []).filter((name) => OPEX_CLIENT_OPT_IN_TOOLS.includes(name)))],
        enabledMcpServers: [...new Set((value?.enabledMcpServers ?? []).filter((id) => typeof id === "string" && id.length > 0))],
    }
}

async function clientConfigDoc(clientId: string): Promise<IOrcamentoClientOpexAgent | null | undefined> {
    await dbConnect()
    const doc = await OrcamentoClient.findById(clientId).select({ opexAgent: 1 }).lean<{ opexAgent?: IOrcamentoClientOpexAgent }>()
    if (!doc) throw new DomainError(404, "Cliente não encontrado", "CLIENT_NOT_FOUND")
    return doc.opexAgent
}

export async function loadClientOpexConfig(clientId: string): Promise<ClientOpexConfig> {
    return normalizeClientOpexConfig(await clientConfigDoc(clientId))
}

/** DTO da tela do dono: ativação + todas as ferramentas ligadas (as de admin aparecem com selo). */
export function clientOpexConfigDto(config: ClientOpexConfig): OpexClientAgentConfigDto {
    return { enabled: config.enabled, enabledTools: enabledOpexClientToolNames(config.disabledTools, true, config.enabledOptInTools), enabledMcpServers: config.enabledMcpServers }
}

export async function getClientOpexConfig(clientId: string): Promise<OpexClientAgentConfigDto> {
    return clientOpexConfigDto(await loadClientOpexConfig(clientId))
}

/** Salva a seleção do dono (auditada) e avisa o app e o canal do cliente. */
export async function saveClientOpexConfig(clientId: string, input: ClientOpexAgentConfigInput, actorId: string): Promise<OpexClientAgentConfigDto> {
    const before = await loadClientOpexConfig(clientId)
    const invalid = input.enabledTools.filter((name) => !OPEX_CLIENT_TOOL_NAMES.includes(name))
    if (invalid.length) throw new DomainError(400, `Ferramenta desconhecida: ${invalid.slice(0, 5).join(", ")}`, "OPEX_TOOL_UNKNOWN")
    const enabled = new Set(input.enabledTools)
    enabled.add(OPEX_CLIENT_CONTEXT_TOOL)
    const next: ClientOpexConfig = {
        enabled: input.enabled,
        disabledTools: OPEX_CLIENT_TOOL_NAMES.filter((name) => name !== OPEX_CLIENT_CONTEXT_TOOL && !OPEX_CLIENT_OPT_IN_TOOLS.includes(name) && !enabled.has(name)),
        enabledOptInTools: OPEX_CLIENT_OPT_IN_TOOLS.filter((name) => enabled.has(name)),
        // Ausente = mantém os MCPs liberados (quem salva só as ferramentas não mexe neles).
        enabledMcpServers: input.enabledMcpServers ? await validMcpServerIds(input.enabledMcpServers) : before.enabledMcpServers,
    }
    await dbConnect()
    await OrcamentoClient.updateOne({ _id: clientId }, { $set: { opexAgent: next } })
    await recordAudit({
        userId: actorId,
        entidade: OPEX_CLIENT_AUDIT_ENTITY,
        entidadeId: clientId,
        acao: AcaoAuditoria.ATUALIZAR,
        antes: { ativado: before.enabled, ferramentas: enabledOpexClientToolNames(before.disabledTools, true, before.enabledOptInTools).length, ligadasPorEscolha: before.enabledOptInTools, mcps: before.enabledMcpServers },
        depois: { ativado: next.enabled, ferramentas: enabledOpexClientToolNames(next.disabledTools, true, next.enabledOptInTools).length, ligadasPorEscolha: next.enabledOptInTools, mcps: next.enabledMcpServers },
    })
    const payload = { clientId }
    await Promise.all([publishAppEvent(OPEX_CLIENT_CONFIG_EVENT, payload), publishToChannels([clientChannel(clientId)], OPEX_CLIENT_CONFIG_EVENT, payload)])
    return clientOpexConfigDto(next)
}

/** Ids de MCP conferidos no cadastro (400 quando algum não existe). */
async function validMcpServerIds(ids: readonly string[]): Promise<string[]> {
    const unique = [...new Set(ids)]
    const { existingMcpServerIds } = await import("./mcp/service")
    const existing = new Set(await existingMcpServerIds(unique))
    const missing = unique.filter((id) => !existing.has(id))
    if (missing.length) throw new DomainError(400, `MCP não encontrado: ${missing.slice(0, 5).join(", ")}`, "OPEX_MCP_NOT_FOUND")
    return unique
}

/** Libera ou retira um MCP de um cliente (ferramenta do agente); mesma auditoria e eventos da tela. */
export async function setClientMcpAccess(clientId: string, mcpServerId: string, enabled: boolean, actorId: string): Promise<OpexClientAgentConfigDto> {
    const current = await loadClientOpexConfig(clientId)
    const ids = new Set(current.enabledMcpServers)
    if (enabled) ids.add(mcpServerId)
    else ids.delete(mcpServerId)
    return saveClientOpexConfig(clientId, { ...clientOpexConfigDto(current), enabledMcpServers: [...ids] }, actorId)
}

/** Nomes liberados agora para o ator (configuração do cliente + papel). */
export async function enabledClientToolNamesFor(actor: ClientActor): Promise<{ names: string[]; config: ClientOpexConfig }> {
    const config = await loadClientOpexConfig(String(actor.client._id))
    return { names: enabledOpexClientToolNames(config.disabledTools, actor.isAdmin, config.enabledOptInTools), config }
}

/** Situação do agente para o portal: configuração, disponibilidade do modelo e limites de arquivo. */
export async function clientOpexStatus(actor: ClientActor): Promise<OpexClientStatusDto> {
    const config = await loadClientOpexConfig(String(actor.client._id))
    const { settings } = await loadOpexSettings()
    const availability = await opexAvailability(settings)
    return {
        enabled: config.enabled,
        available: availability.available,
        reason: availability.reason ?? null,
        modelLabel: settings.main.provider && settings.main.model ? `${getAiProvider(settings.main.provider).name} · ${settings.main.model}` : null,
        files: settings.files,
    }
}

/**
 * Revalida, imediatamente antes de executar uma ferramenta, que o ator continua no cliente e que a
 * ferramenta segue liberada para o papel dele. Devolve o ator atualizado (o papel pode ter mudado).
 */
export async function assertClientToolAllowed(toolName: string, actor: ClientActor, mcpServerId?: string): Promise<ClientActor> {
    const fresh = await clientActorFor(actor.userId, String(actor.client._id))
    const config = await assertClientOpexEnabled(fresh)
    if (mcpServerId) {
        // Ferramenta de MCP: o MCP segue liberado ao cliente e habilitado no Agente Opex.
        const { loadEnabledMcpServers } = await import("./mcp/service")
        const allowed = config.enabledMcpServers.includes(mcpServerId) && (await loadEnabledMcpServers([mcpServerId])).length > 0
        if (!allowed) throw new DomainError(403, "Este MCP foi desativado para o cliente.", "OPEX_TOOL_DISABLED")
        return fresh
    }
    const { names } = await enabledClientToolNamesFor(fresh)
    if (!names.includes(toolName)) throw new DomainError(403, "Esta ferramenta foi desativada para o cliente.", "OPEX_TOOL_DISABLED")
    return fresh
}

/** Recusa o uso do agente quando o dono o desativou para o cliente (403). */
export async function assertClientOpexEnabled(actor: ClientActor): Promise<ClientOpexConfig> {
    const config = await loadClientOpexConfig(String(actor.client._id))
    if (!config.enabled) throw new DomainError(403, "O Agente Opex está desativado para este cliente.", "OPEX_CLIENT_DISABLED")
    return config
}
