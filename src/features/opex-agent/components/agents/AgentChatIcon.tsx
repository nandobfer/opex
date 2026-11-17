"use client"

import type { LucideIcon } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { agentColorStyle } from "@/features/maddox-agent/colors"
import type { ChatAgentId } from "../../agents"

interface AgentChatIconProps {
    active: ChatAgentId
    icon: LucideIcon
    open: boolean
    anyBusy: boolean
    colors: Record<ChatAgentId, string | null>
    busyAgent: ChatAgentId
    reduceMotion: boolean
    /** Contorno do ponto de atividade (cor do fundo atrás do ícone). */
    dotRingClassName?: string
}

/**
 * Ícone do agente de chat ativo (troca animada ao mudar de agente, balanço ao abrir) com o ponto
 * pulsando quando alguma sessão está respondendo. Usado no item do menu lateral e no botão do
 * cabeçalho do celular.
 */
export function AgentChatIcon({ active, icon: Icon, open, anyBusy, colors, busyAgent, reduceMotion, dotRingClassName = "ring-sidebar" }: AgentChatIconProps) {
    return (
        <span className="relative" style={agentColorStyle(colors[active])}>
            <AnimatePresence mode="wait" initial={false}>
                <motion.span
                    key={active}
                    className="inline-flex text-primary"
                    initial={reduceMotion ? false : { opacity: 0, scale: 0.6, rotate: -20 }}
                    animate={open && !reduceMotion ? { opacity: 1, scale: 1, rotate: [0, -12, 10, 0] } : { opacity: 1, scale: 1, rotate: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, scale: 0.6, rotate: 20 }}
                    transition={{ duration: 0.3 }}
                >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden />
                </motion.span>
            </AnimatePresence>
            <AnimatePresence>
                {anyBusy && (
                    <motion.span key="busy" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute -right-1 -top-1 flex h-2.5 w-2.5" style={agentColorStyle(colors[busyAgent])} aria-hidden data-testid="agent-nav-busy">
                        {!reduceMotion && <motion.span className="absolute inset-0 rounded-full bg-primary" animate={{ opacity: [0.7, 0], scale: [1, 2.2] }} transition={{ duration: 1.4, repeat: Infinity }} />}
                        <span className={cn("relative h-2.5 w-2.5 rounded-full bg-primary ring-2", dotRingClassName)} />
                    </motion.span>
                )}
            </AnimatePresence>
        </span>
    )
}
