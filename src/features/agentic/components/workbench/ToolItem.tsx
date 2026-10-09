"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { CheckCircle2, ChevronRight, Loader2, Wrench, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TimelineItem } from "../../timeline"

type ToolTimelineItem = Extract<TimelineItem, { kind: "tool" }>

/** Ferramenta usada pelo agente; a saída (ex.: o build) abre/fecha e acompanha ao vivo. */
export function ToolItem({ item }: { item: ToolTimelineItem }) {
    // Abre sozinha quando chega executando (ex.: o build), para a saída aparecer ao vivo.
    const [open, setOpen] = useState(item.state === "running")
    const hasDetails = Boolean(item.output || item.error)
    const running = item.state === "running"
    return (
        <div className="rounded-md border bg-muted/20 text-xs">
            <button type="button" className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left disabled:cursor-default" onClick={() => setOpen((value) => !value)} disabled={!hasDetails} aria-expanded={hasDetails ? open : undefined}>
                {running ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" aria-hidden /> : item.state === "done" ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden /> : <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />}
                <Wrench className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                <span className="shrink-0 font-medium">{item.name}</span>
                {item.input && <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">{item.input}</span>}
                {hasDetails && <ChevronRight className={cn("ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} aria-hidden />}
            </button>
            <AnimatePresence initial={false}>
                {open && hasDetails && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                        {item.error && <p className="border-t px-2.5 py-1.5 text-destructive">{item.error}</p>}
                        {item.output && <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words border-t bg-background/60 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">{item.output}</pre>}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
