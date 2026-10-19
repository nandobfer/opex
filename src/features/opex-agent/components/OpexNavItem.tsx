"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Bot } from "lucide-react"
import { cn } from "@/lib/utils"
import { VisuallyHidden } from "@/components/ui/visually-hidden"
import { SidebarTooltip } from "@/features/layout/components/sidebar/SidebarTooltip"
import { SIDEBAR_FOCUS_RING, sidebarItemVariants } from "@/features/layout/components/sidebar/sidebar-styles"
import { isOpexShortcut } from "../constants"
import { useOpexRealtime, useOpexSessions } from "../hooks/useOpexSessions"
import { OpexUploadsProvider } from "../hooks/useOpexUploads"
import { OpexPanel } from "./OpexPanel"

const LABEL = "Agente Opex"
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

interface OpexNavItemProps {
    collapsed: boolean
}

/**
 * Item "Agente Opex" da barra lateral (só no menu do dono): abre o chat num popover ancorado no item (no celular,
 * painel em tela cheia). Mostra um ponto pulsando quando alguma sessão está respondendo ou espera
 * confirmação.
 */
export function OpexNavItem(props: OpexNavItemProps) {
    // A fila de arquivos fica fora do popover: fechar o chat não perde os envios em andamento.
    return (
        <OpexUploadsProvider>
            <OpexNavItemContent {...props} />
        </OpexUploadsProvider>
    )
}

function OpexNavItemContent({ collapsed }: OpexNavItemProps) {
    const [open, setOpen] = useState(false)
    const [maximized, setMaximized] = useState(false)
    const reduceMotion = useReducedMotion() ?? false
    const viewport = useViewport()
    const mobile = viewport.width < MOBILE_MAX
    const sessions = useOpexSessions()
    useOpexRealtime(true)
    const busy = (sessions.data ?? []).some((session) => session.status === "running" || session.status === "awaiting_confirmation")

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (!isOpexShortcut(event)) return
            event.preventDefault()
            setOpen((value) => !value)
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [])

    const trigger = (
        <button type="button" aria-label={collapsed ? LABEL : undefined} aria-expanded={open} aria-haspopup="dialog" className={cn("block w-full rounded-[4px]", SIDEBAR_FOCUS_RING)} onClick={() => setOpen((value) => !value)}>
            <motion.div
                variants={sidebarItemVariants}
                initial="hidden"
                animate="show"
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                    "relative flex w-full items-center gap-3 rounded-[4px] px-3 py-2 text-sm transition-colors",
                    open ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                    collapsed && "justify-center px-0 py-2.5",
                )}
            >
                <span className="relative">
                    <motion.span className="inline-flex" animate={open && !reduceMotion ? { rotate: [0, -12, 10, 0] } : { rotate: 0 }} transition={{ duration: 0.4 }}>
                        <Bot className="h-5 w-5 shrink-0" aria-hidden />
                    </motion.span>
                    <AnimatePresence>
                        {busy && (
                            <motion.span key="busy" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute -right-1 -top-1 flex h-2.5 w-2.5" aria-hidden>
                                {!reduceMotion && <motion.span className="absolute inset-0 rounded-full bg-primary" animate={{ opacity: [0.7, 0], scale: [1, 2.2] }} transition={{ duration: 1.4, repeat: Infinity }} />}
                                <span className="relative h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-sidebar" />
                            </motion.span>
                        )}
                    </AnimatePresence>
                </span>
                {!collapsed && <span className="min-w-0 flex-1 truncate text-left">{LABEL}</span>}
                {busy && <span className="sr-only">: respondendo</span>}
            </motion.div>
        </button>
    )

    if (mobile) {
        return (
            <li>
                <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
                    <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
                    <AnimatePresence>
                        {open && (
                            <DialogPrimitive.Portal forceMount>
                                <DialogPrimitive.Content forceMount asChild aria-describedby={undefined} onOpenAutoFocus={(event) => event.preventDefault()}>
                                    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ duration: 0.22, ease: "easeOut" }} className="fixed inset-0 z-50 flex flex-col bg-popover text-popover-foreground">
                                        <VisuallyHidden>
                                            <DialogPrimitive.Title>{LABEL}</DialogPrimitive.Title>
                                        </VisuallyHidden>
                                        <OpexPanel maximized onClose={() => setOpen(false)} />
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
            <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
                <SidebarTooltip label={LABEL} enabled={collapsed && !open}>
                    <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
                </SidebarTooltip>
                <AnimatePresence>
                    {open && (
                        <PopoverPrimitive.Portal forceMount>
                            <PopoverPrimitive.Content forceMount asChild side="right" align="end" sideOffset={12} collisionPadding={12} onOpenAutoFocus={(event) => event.preventDefault()} aria-label={LABEL}>
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.92, x: -12 }}
                                    animate={{ opacity: 1, scale: 1, x: 0, width, height }}
                                    exit={{ opacity: 0, scale: 0.94, x: -8, transition: { duration: 0.15 } }}
                                    transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 }}
                                    style={{ transformOrigin: "var(--radix-popover-content-transform-origin)" }}
                                    className="z-50 flex flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl shadow-primary/10"
                                >
                                    <OpexPanel maximized={maximized} onToggleMaximize={() => setMaximized((value) => !value)} onClose={() => setOpen(false)} />
                                </motion.div>
                            </PopoverPrimitive.Content>
                        </PopoverPrimitive.Portal>
                    )}
                </AnimatePresence>
            </PopoverPrimitive.Root>
        </li>
    )
}
