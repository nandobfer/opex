import type { LucideIcon } from "lucide-react"
import { api } from "@/lib/api"
import { appChannel } from "@/lib/pusher/channel-names"
import { ROUTINE_CHAT_SESSION_DELETED_EVENT, ROUTINE_CHAT_SESSION_UPDATED_EVENT } from "@/features/opex-agent/constants"
import type { ChatAgentDescriptor } from "@/features/opex-agent/components/agents/agent-descriptors"
import type { OpexUiScope } from "@/features/opex-agent/components/OpexScopeProvider"
import { routineChatApiBase, routineChatQueryPrefix, routineChatTabsKey } from "../../chat"

/**
 * Escopo da interface de chat para a conversa com um agente rotineiro (OPE-160): as mesmas peças do
 * Agente Opex/Maddox (abas, lista de sessões, mensagens, campo, confirmação) com as rotas
 * `/api/routine-agents/[id]/chat`, os eventos `routine-chat-session-*` em `private-app`, cache e abas
 * próprios do agente e sem anexos.
 */
export function routineChatUiScope(agent: { id: string; title: string }, icon: LucideIcon): OpexUiScope {
    const apiBase = routineChatApiBase(agent.id)
    const descriptor: ChatAgentDescriptor = {
        id: "routine",
        label: agent.title,
        icon,
        ownerApiBase: apiBase,
        clientApiBase: apiBase,
        events: { updated: ROUTINE_CHAT_SESSION_UPDATED_EVENT, deleted: ROUTINE_CHAT_SESSION_DELETED_EVENT },
        queryPrefix: routineChatQueryPrefix(agent.id),
        tabsKey: routineChatTabsKey(agent.id),
        settingsHref: "",
        shortcutLabel: "",
        isShortcut: () => false,
        modelPicker: false,
        jobs: false,
        attachments: false,
    }
    return { kind: "owner", agent: descriptor, apiBase, http: api, channel: appChannel(), queryPrefix: descriptor.queryPrefix, tabsKey: descriptor.tabsKey, settingsHref: null, clientName: null }
}
