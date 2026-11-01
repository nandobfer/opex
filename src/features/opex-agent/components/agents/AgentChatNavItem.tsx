"use client"

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"
import { VisuallyHidden } from "@/components/ui/visually-hidden"
import { SidebarTooltip } from "@/features/layout/components/sidebar/SidebarTooltip"
import { SidebarItemSurface } from "@/features/layout/components/sidebar/SidebarItemSurface"
import { SIDEBAR_FOCUS_RING } from "@/features/layout/components/sidebar/sidebar-styles"
import { agentColorStyle } from "@/features/maddox-agent/colors"
import { CHAT_AGENT_IDS, type ChatAgentId } from "../../agents"
import { useOpexRealtime, useOpexSessions } from "../../hooks/useOpexSessions"
import { useOpexJobNotifications } from "../../hooks/useOpexJobs"
import { OpexUploadsProvider } from "../../hooks/useOpexUploads"
import { onOpenOpexSession } from "../../open-session"
import { OpexScopeProvider, useOpexScope, type OpexClientUiScope } from "../OpexScopeProvider"
import { AgentChatPanel } from "./AgentChatPanel"
import { AgentSwitchProvider, useAgentSwitch } from "./AgentSwitchProvider"

const MOBILE_MAX = 768

function subscribeResize(callback: () => void) {
    window.addEventListener("resize", callback)
    return () => window.removeEventListener("resize", callback)
}

/** Tamanho da janela (para o painel do desktop e o modo celular). */
function useViewport(): { width: number; height: number } {
    const width = useSyncExternalStore(subscribeResize, () => window.innerWidth, () => 1280)
    const height = useSyncExternalStore(subscribeResize, () => window.innerHeight, () => 800)
    return { width, height }
}

export interface AgentChatNavItemProps {
    collapsed: boolean
    /** Portal do cliente (sem = app do dono). */
    client?: OpexClientUiScope
    /** Portal: agentes ligados para o cliente no carregamento da página. */
    initial?: Partial<Record<ChatAgentId, boolean>>
}

/**
 * Item **único** dos agentes de chat na barra lateral (dono e portal): abre o último agente escolhido
 * num popover ancorado no item (no celular, tela cheia). O cabeçalho troca entre o Agente Opex e o
 * Agente Maddox, e o item acompanha (nome, ícone e cor). Ponto pulsando: alguma sessão de qualquer
 * agente respondendo ou aguardando confirmação. Atalhos: Ctrl+Shift+O (Opex) e Ctrl+Shift+M (Maddox).
 */
export function AgentChatNavItem({ collapsed, client, initial }: AgentChatNavItemProps) {
    return (
        <AgentSwitchProvider client={client} initial={initial}>
            <AgentUploads>
                <AgentChatNavItemContent collapsed={collapsed} />
            </AgentUploads>
        </AgentSwitchProvider>
    )
}

/** As filas de envio dos dois agentes ficam acima do popover: fechar ou trocar de agente não perde envios. */
function AgentUploads({ children }: { children: ReactNode }) {
    const { scopes } = useAgentSwitch()
    return (
        <OpexUploadsProvider scope={scopes.opex}>
            <OpexUploadsProvider scope={scopes.maddox}>{children}</OpexUploadsProvider>
        </OpexUploadsProvider>
    )
}

/** Sessões, tempo real e jobs de um agente disponível (mesmo fechado): alimenta o ponto de atividade. */
function AgentActivity() {
    const { agent } = useOpexScope()
    const { reportBusy } = useAgentSwitch()
    const sessions = useOpexSessions()
    useOpexRealtime(true)
    useOpexJobNotifications(agent.jobs)
    const busy = (sessions.data ?? []).some((session) => session.status === "running" || session.status === "awaiting_confirmation")
    useEffect(() => {
        reportBusy(agent.id, busy)
        return () => reportBusy(agent.id, false)
    }, [agent.id, busy, reportBusy])
    return null
}

function AgentChatNavItemContent({ collapsed }: { collapsed: boolean }) {
    const { available, active, setActive, scopes, colors, busy } = useAgentSwitch()
    const [open, setOpen] = useState(false)
    const [maximized, setMaximized] = useState(false)
    const [focusSessionId, setFocusSessionId] = useState<string | null>(null)
    const [visited, setVisited] = useState<ChatAgentId[]>([])
    const reduceMotion = useReducedMotion() ?? false
    const viewport = useViewport()
    const mobile = viewport.width < MOBILE_MAX
    const opexAvailable = available.includes("opex")

    // Painéis já abertos ficam montados (rascunho e rolagem preservados ao trocar de agente): ajuste
    // de estado durante o render, a partir do agente ativo.
    if (open && active && !visited.includes(active)) setVisited([...visited, active])

    useEffect(() => {
        if (!opexAvailable) return
        return onOpenOpexSession((sessionId) => {
            setActive("opex")
            setFocusSessionId(sessionId)
            setOpen(true)
        })
    }, [opexAvailable, setActive])

    useEffect(() => {
        if (!available.length) return
        const onKey = (event: KeyboardEvent) => {
            const target = available.find((id) => scopes[id].agent.isShortcut(event))
            if (!target) return
            event.preventDefault()
            if (open && active === target) setOpen(false)
            else {
                setActive(target)
                setOpen(true)
            }
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [available, scopes, open, active, setActive])

    if (!active) return null

    const agent = scopes[active].agent
    const Icon = agent.icon
    const anyBusy = available.some((id) => busy[id])
    // O ponto usa a cor do agente que está trabalhando (o ativo tem prioridade).
    const busyAgent = busy[active] ? active : (available.find((id) => busy[id]) ?? active)

    const activity = available.map((id) => (
        <OpexScopeProvider key={id} value={scopes[id]}>
            <AgentActivity />
        </OpexScopeProvider>
    ))

    const panels = (
        <>
            {CHAT_AGENT_IDS.filter((id) => available.includes(id) && (visited.includes(id) || id === active)).map((id) => {
                const isActive = id === active
                return (
                    <OpexScopeProvider key={id} value={scopes[id]}>
                        <motion.div
                            hidden={!isActive}
                            initial={false}
                            animate={isActive ? { opacity: 1, x: 0 } : { opacity: 0, x: -8 }}
                            transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }}
                            style={agentColorStyle(colors[id])}
                            className="flex min-h-0 flex-1 flex-col"
                            data-testid={`agent-panel-${id}`}
                        >
                            <AgentChatPanel
                                maximized={mobile || maximized}
                                onToggleMaximize={mobile ? undefined : () => setMaximized((value) => !value)}
                                onClose={() => setOpen(false)}
                                focusSessionId={isActive ? focusSessionId : null}
                                onFocused={() => setFocusSessionId(null)}
                            />
                        </motion.div>
                    </OpexScopeProvider>
                )
            })}
        </>
    )

    const trigger = (
        <button type="button" aria-label={collapsed ? agent.label : undefined} aria-expanded={open} aria-haspopup="dialog" className={cn("block w-full rounded-[4px]", SIDEBAR_FOCUS_RING)} onClick={() => setOpen((value) => !value)} data-testid="agent-nav-item">
            <SidebarItemSurface active={open} activeBar={false} collapsed={collapsed} reduceMotion={reduceMotion}>
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
                                <span className="relative h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-sidebar" />
                            </motion.span>
                        )}
                    </AnimatePresence>
                </span>
                {!collapsed && (
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.span key={active} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }} className="min-w-0 flex-1 truncate text-left">
                            {agent.label}
                        </motion.span>
                    </AnimatePresence>
                )}
                {anyBusy && <span className="sr-only">: respondendo</span>}
            </SidebarItemSurface>
        </button>
    )

    if (mobile) {
        return (
            <li>
                {activity}
                <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
                    <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
                    <AnimatePresence>
                        {open && (
                            <DialogPrimitive.Portal forceMount>
                                <DialogPrimitive.Content forceMount asChild aria-describedby={undefined} onOpenAutoFocus={(event) => event.preventDefault()}>
                                    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ duration: 0.22, ease: "easeOut" }} className="fixed inset-0 z-50 flex flex-col bg-popover text-popover-foreground">
                                        <VisuallyHidden>
                                            <DialogPrimitive.Title>{agent.label}</DialogPrimitive.Title>
                                        </VisuallyHidden>
                                        {panels}
                                    </motion.div>
                                </DialogPrimitive.Content>
                            </DialogPrimitive.Portal>
                        )}
                    </AnimatePresence>
                </DialogPrimitive.Root>
            </li>
        )
    }

    const width = maximized ? viewport.width - 100 : Math.min(720, viewport.width - 100)
    const height = maximized ? viewport.height - 24 : Math.min(680, viewport.height - 48)

    return (
        <li>
            {activity}
            <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
                <SidebarTooltip label={agent.label} enabled={collapsed && !open}>
                    <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
                </SidebarTooltip>
                <AnimatePresence>
                    {open && (
                        <PopoverPrimitive.Portal forceMount>
                            <PopoverPrimitive.Content forceMount asChild side="right" align="end" sideOffset={12} collisionPadding={12} onOpenAutoFocus={(event) => event.preventDefault()} aria-label={agent.label}>
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.92, x: -12 }}
                                    animate={{ opacity: 1, scale: 1, x: 0, width, height }}
                                    exit={{ opacity: 0, scale: 0.94, x: -8, transition: { duration: 0.15 } }}
                                    transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 }}
                                    style={{ transformOrigin: "var(--radix-popover-content-transform-origin)", ...agentColorStyle(colors[active]) }}
                                    className="z-50 flex flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl shadow-primary/10"
                                >
                                    {panels}
                                </motion.div>
                            </PopoverPrimitive.Content>
                        </PopoverPrimitive.Portal>
                    )}
                </AnimatePresence>
            </PopoverPrimitive.Root>
        </li>
    )
}
