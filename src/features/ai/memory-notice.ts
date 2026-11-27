import type { NoticeMemoryAction, WorkbenchNoticeMemoryRef } from "@/features/agentic/types"
import { channelDisplay, LEGACY_NAMESPACE } from "@/features/engramind/channel-namespace"
import { AI_AGENTS, memoryChannelOf, type AiAgentId, type ChannelNamespace, type MemoryListScope } from "./agents"

/**
 * Referência de memória nos avisos da mesa (OPE-139), módulo puro: o aviso guarda só lista, id e escopo;
 * título, categoria e texto são lidos do Engramind quando o painel abre (nada é duplicado no evento).
 */

export type NoticeMemoryRef = Extract<WorkbenchNoticeMemoryRef, { kind: "memory" }>
export type NoticeSuggestionRef = Extract<WorkbenchNoticeMemoryRef, { kind: "suggestion" }>

/** Rota base (sem `/api`) das memórias de uma lista: global, de uma central ou de um cliente. */
export function memoryListBasePath(agentId: AiAgentId, scope: MemoryListScope = {}): string {
    const def = AI_AGENTS[agentId]
    if (def.scope === "central" && scope.centralId) return `/agentic/centrals/${scope.centralId}/memories`
    if (def.scope === "client" && scope.clientId) return `/ai/agents/${agentId}/clients/${scope.clientId}/memories`
    return `/ai/agents/${agentId}/memories`
}

/** Referência da memória gravada ou alterada (o escopo vem da própria memória ou da lista). */
export function noticeMemoryRef(agentId: AiAgentId, memory: { id: string; centralId?: string | null; clientId?: string | null }, action: NoticeMemoryAction, scope: MemoryListScope = {}): NoticeMemoryRef {
    const def = AI_AGENTS[agentId]
    const centralId = def.scope === "central" ? (memory.centralId ?? scope.centralId ?? undefined) : undefined
    const clientId = def.scope === "client" ? (memory.clientId ?? scope.clientId ?? undefined) : undefined
    return { kind: "memory", agentId, memoryId: memory.id, ...(centralId ? { centralId } : {}), ...(clientId ? { clientId } : {}), action }
}

/** Rota (sem `/api`) da leitura de uma memória referenciada. */
export function memoryDetailPath(ref: NoticeMemoryRef): string {
    return `${memoryListBasePath(ref.agentId, ref)}/${encodeURIComponent(ref.memoryId)}`
}

/** Canal da memória: título da lista e o slug LÓGICO mostrado na tela (sem consulta; OPE-206: o real leva o app). */
export function memoryChannelInfo(agentId: AiAgentId, scope: MemoryListScope = {}, ns: ChannelNamespace = LEGACY_NAMESPACE): { title: string; slug: string | null } {
    const real = memoryChannelOf(agentId, scope, ns)
    return { title: AI_AGENTS[agentId].title, slug: real ? channelDisplay(ns, real) : null }
}

/** Rótulo da ação no rodapé do painel. */
export const NOTICE_MEMORY_ACTION_LABELS: Record<NoticeMemoryAction | "suggested", string> = {
    created: "Memória nova",
    updated: "Memória editada",
    pinned: "Memória fixada",
    unpinned: "Memória desafixada",
    activated: "Memória reativada",
    archived: "Memória inativada",
    deleted: "Memória excluída",
    suggested: "Sugestão, ainda não gravada",
}
