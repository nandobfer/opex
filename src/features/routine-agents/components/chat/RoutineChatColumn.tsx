"use client"

import { useMemo } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import { z } from "zod"
import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { usePersistentState } from "@/hooks/usePersistentState"
import { OpexScopeProvider } from "@/features/opex-agent/components/OpexScopeProvider"
import { AgentChatBody, useAgentChat } from "@/features/opex-agent/components/agents/AgentChatBody"
import { useOpexRealtime } from "@/features/opex-agent/hooks/useOpexSessions"
import { ROUTINE_CHAT_COLLAPSED_STORAGE_KEY } from "../../chat"
import {
    ROUTINE_CHAT_COLLAPSED_WIDTH,
    ROUTINE_CHAT_EXPANDED_WIDTH,
    ROUTINE_CHAT_MEDIA_QUERY,
    ROUTINE_CHAT_PANEL,
    ROUTINE_CHAT_PANEL_COLLAPSED,
    ROUTINE_CHAT_PANEL_EXPANDED,
} from "../page/routine-agents-layout"
import { routineChatUiScope } from "./routine-chat-scope"
import { RoutineChatHeader } from "./RoutineChatHeader"
import { RoutineChatRail } from "./RoutineChatRail"

/** Conversa recolhida ou expandida, guardada no navegador (vale para todos os agentes). */
export function useRoutineChatCollapsed(): { collapsed: boolean; setCollapsed: (value: boolean) => void } {
    const { value, setValue } = usePersistentState(ROUTINE_CHAT_COLLAPSED_STORAGE_KEY, z.boolean(), false)
    return { collapsed: value, setCollapsed: setValue }
}

interface RoutineChatColumnProps {
    agent: { id: string; title: string }
    icon: LucideIcon
    collapsed: boolean
    onCollapsedChange: (collapsed: boolean) => void
}

/**
 * Coluna da conversa com o agente rotineiro na Visão geral (OPE-160): o chat do Agente Opex/Maddox
 * (`AgentChatBody`) no escopo do agente. Recolhe para a direita num contêiner compacto (largura animada
 * com Framer Motion, respeitando o movimento reduzido); o estado das sessões fica montado nos dois modos.
 */
export function RoutineChatColumn({ agent, icon, collapsed, onCollapsedChange }: RoutineChatColumnProps) {
    const scope = useMemo(() => routineChatUiScope({ id: agent.id, title: agent.title }, icon), [agent.id, agent.title, icon])
    return (
        <OpexScopeProvider value={scope}>
            <RoutineChatColumnContent label={agent.title} collapsed={collapsed} onCollapsedChange={onCollapsedChange} />
        </OpexScopeProvider>
    )
}

function RoutineChatColumnContent({ label, collapsed, onCollapsedChange }: { label: string; collapsed: boolean; onCollapsedChange: (collapsed: boolean) => void }) {
    const reduceMotion = useReducedMotion() ?? false
    const wide = useMediaQuery(ROUTINE_CHAT_MEDIA_QUERY)
    useOpexRealtime(true)
    const chat = useAgentChat()
    const width = wide ? (collapsed ? ROUTINE_CHAT_COLLAPSED_WIDTH : ROUTINE_CHAT_EXPANDED_WIDTH) : "100%"
    const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: reduceMotion ? 0 : 0.15 } }
    return (
        <motion.aside
            initial={false}
            animate={{ width }}
            transition={{ duration: reduceMotion ? 0 : 0.25, ease: "easeInOut" }}
            className={cn(ROUTINE_CHAT_PANEL, collapsed ? ROUTINE_CHAT_PANEL_COLLAPSED : ROUTINE_CHAT_PANEL_EXPANDED)}
            aria-label={`Conversa com ${label}`}
            data-testid="routine-chat"
            data-collapsed={collapsed ? "true" : "false"}
        >
            <AnimatePresence mode="wait" initial={false}>
                {collapsed ? (
                    <motion.div key="rail" {...fade} className="flex min-h-0 w-full flex-1">
                        <RoutineChatRail chat={chat} onExpand={() => onCollapsedChange(false)} />
                    </motion.div>
                ) : (
                    <motion.div key="panel" {...fade} className="flex min-h-0 w-full flex-1 flex-col">
                        <RoutineChatHeader chat={chat} onCollapse={() => onCollapsedChange(true)} />
                        <AgentChatBody chat={chat} />
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.aside>
    )
}
