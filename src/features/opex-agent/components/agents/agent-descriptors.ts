import { Bot, Orbit, type LucideIcon } from "lucide-react"
import { MADDOX_AI_TAB, MADDOX_LABEL, MADDOX_TABS_STORAGE_KEY, isMaddoxShortcut } from "@/features/maddox-agent/constants"
import { AGENT_SESSION_EVENTS_BY_ID } from "../../agent-events"
import type { ChatAgentId } from "../../agents"
import { OPEX_AI_TAB, OPEX_TABS_STORAGE_KEY, isOpexShortcut } from "../../constants"

type ShortcutEvent = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">

/** O que muda entre os agentes no item, no popover e nos hooks (o resto é compartilhado). */
export interface ChatAgentDescriptor {
    id: ChatAgentId
    label: string
    icon: LucideIcon
    /** Prefixo das rotas (a partir de `/api`) no app do dono e no portal. */
    ownerApiBase: string
    clientApiBase: string
    events: { updated: string; deleted: string }
    /** Prefixo das chaves do TanStack Query (o portal acrescenta cliente e usuário). */
    queryPrefix: string
    tabsKey: string
    /** Configuração do agente (engrenagem do cabeçalho; só no app do dono). */
    settingsHref: string
    shortcutLabel: string
    isShortcut: (event: ShortcutEvent) => boolean
    /** Seletor de modelo da sessão no cabeçalho (só o Maddox troca o modelo por sessão). */
    modelPicker: boolean
    /** Jobs agendados (só o Agente Opex). */
    jobs: boolean
}

export const CHAT_AGENTS: Record<ChatAgentId, ChatAgentDescriptor> = {
    opex: {
        id: "opex",
        label: "Agente Opex",
        icon: Bot,
        ownerApiBase: "/opex",
        clientApiBase: "/cliente/opex",
        events: AGENT_SESSION_EVENTS_BY_ID.opex,
        queryPrefix: "opex-agent",
        tabsKey: OPEX_TABS_STORAGE_KEY,
        settingsHref: `/integracoes/ia?aba=${OPEX_AI_TAB}`,
        shortcutLabel: "Ctrl+Shift+O",
        isShortcut: isOpexShortcut,
        modelPicker: false,
        jobs: true,
    },
    maddox: {
        id: "maddox",
        label: MADDOX_LABEL,
        icon: Orbit,
        ownerApiBase: "/maddox",
        clientApiBase: "/cliente/maddox",
        events: AGENT_SESSION_EVENTS_BY_ID.maddox,
        queryPrefix: "maddox-agent",
        tabsKey: MADDOX_TABS_STORAGE_KEY,
        settingsHref: `/integracoes/ia?aba=${MADDOX_AI_TAB}`,
        shortcutLabel: "Ctrl+Shift+M",
        isShortcut: isMaddoxShortcut,
        modelPicker: true,
        jobs: false,
    },
}
