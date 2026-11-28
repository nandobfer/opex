"use client"

import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowRight, Ban } from "lucide-react"
import type { BootstrapBlocker } from "../../types"

/** O que impede o envio (agente desativado, OpenCode desconectado, token do GitHub ausente), com o caminho. */
export function BlockersNotice({ blockers }: { blockers: readonly BootstrapBlocker[] }) {
    return (
        <AnimatePresence initial={false}>
            {blockers.length > 0 && (
                <motion.div key="blockers" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden rounded-md border border-destructive/40 bg-destructive/10" role="alert">
                    <ul className="space-y-2 p-3">
                        {blockers.map((blocker) => (
                            <li key={blocker.message} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                <span className="flex items-center gap-2 text-destructive">
                                    <Ban className="h-4 w-4 shrink-0" aria-hidden /> {blocker.message}
                                </span>
                                <Link href={blocker.href} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                                    {blocker.action} <ArrowRight className="h-3 w-3" aria-hidden />
                                </Link>
                            </li>
                        ))}
                    </ul>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
