"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, ChevronDown, GitPullRequest, Hourglass, ListOrdered, PlugZap, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { StatusNotice } from "../../workbench-notices"

const ICONS: Record<StatusNotice["icon"], LucideIcon> = { plug: PlugZap, hourglass: Hourglass, pr: GitPullRequest, queue: ListOrdered, info: AlertTriangle }

const ENTER = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.18 } } as const

/** Desktop: todos os avisos acima dos botões (o erro em destaque). */
export function StatusNoticeList({ notices }: { notices: readonly StatusNotice[] }) {
    return (
        <AnimatePresence initial={false}>
            {notices.map((notice) => {
                if (notice.tone === "error")
                    return (
                        <motion.p key={notice.key} {...ENTER} className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive" role={notice.role ?? undefined}>
                            {notice.text}
                        </motion.p>
                    )
                const Icon = ICONS[notice.icon]
                return (
                    <motion.p key={notice.key} {...ENTER} className="flex items-center gap-2 text-xs text-muted-foreground" role={notice.role ?? undefined}>
                        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden /> {notice.text}
                    </motion.p>
                )
            })}
        </AnimatePresence>
    )
}

/**
 * Celular (`< lg`, OPE-166): o aviso mais importante numa linha só; o toque expande o texto completo e os
 * demais avisos. Assim os avisos não roubam a altura da saída da IA.
 */
export function StatusNoticeLine({ notices }: { notices: readonly StatusNotice[] }) {
    const [open, setOpen] = useState(false)
    const [first, ...rest] = notices
    if (!first) return null
    const Icon = ICONS[first.icon]
    const error = first.tone === "error"
    return (
        <div className={cn("rounded-md text-xs", error ? "border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-destructive" : "text-muted-foreground")} data-testid="workbench-status-line">
            <button type="button" className="flex w-full items-start gap-2 text-left" aria-expanded={open} onClick={() => setOpen((value) => !value)} role={first.role ?? undefined}>
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className={cn("min-w-0 flex-1", !open && "line-clamp-1")}>{first.text}</span>
                {rest.length > 0 && !open && <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] text-foreground">+{rest.length}</span>}
                <ChevronDown className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
                <span className="sr-only">{open ? "Recolher avisos" : "Ver avisos completos"}</span>
            </button>
            <AnimatePresence initial={false}>
                {open &&
                    rest.map((notice) => {
                        const RestIcon = ICONS[notice.icon]
                        return (
                            <motion.p key={notice.key} {...ENTER} className={cn("mt-1.5 flex items-start gap-2 overflow-hidden", notice.tone === "error" ? "text-destructive" : "text-muted-foreground")} role={notice.role ?? undefined}>
                                <RestIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {notice.text}
                            </motion.p>
                        )
                    })}
            </AnimatePresence>
        </div>
    )
}
