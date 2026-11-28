"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { CheckCircle2, Circle, ExternalLink, Loader2, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

export type RowState = "pending" | "running" | "done" | "failed"

const ICON = { pending: Circle, running: Loader2, done: CheckCircle2, failed: XCircle } as const
const TONE: Record<RowState, string> = { pending: "text-muted-foreground", running: "text-primary", done: "text-success", failed: "text-destructive" }

/** Linha de um item criado pelo bootstrap (vínculo, central, ambiente…), com o estado e o link. */
export function ProgressRow({ label, description, state, href, external }: { label: string; description?: ReactNode; state: RowState; href?: string | null; external?: boolean }) {
    const Icon = ICON[state]
    return (
        <motion.li layout="position" className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5" data-state={state}>
            <span className="flex min-w-0 items-center gap-2.5">
                <motion.span key={state} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
                    <Icon className={cn("h-4 w-4 shrink-0", TONE[state], state === "running" && "animate-spin")} aria-hidden />
                </motion.span>
                <span className="min-w-0">
                    <span className="block text-sm font-medium">{label}</span>
                    {description && <span className="block truncate text-xs text-muted-foreground">{description}</span>}
                </span>
            </span>
            {href &&
                (external ? (
                    <a href={href} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline">
                        Abrir <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                ) : (
                    <Link href={href} className="shrink-0 text-xs font-medium text-primary hover:underline">
                        Abrir
                    </Link>
                ))}
        </motion.li>
    )
}
