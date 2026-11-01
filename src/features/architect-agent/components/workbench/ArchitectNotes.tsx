"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronDown, StickyNote } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ARCHITECT_NOTE_KIND_LABELS } from "../../constants"
import type { ArchitectNote } from "../../graph"

/** Decisões, riscos e dúvidas do plano (recolhível acima do canvas). */
export function ArchitectNotes({ notes }: { notes: readonly ArchitectNote[] }) {
    const [open, setOpen] = useState(false)
    if (!notes.length) return null
    return (
        <div>
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
                <StickyNote className="h-3.5 w-3.5" aria-hidden /> Decisões, riscos e dúvidas ({notes.length})
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden />
            </Button>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.ul key="notes" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="max-h-40 space-y-1 overflow-y-auto pt-1">
                        {notes.map((note, index) => (
                            <li key={index} className="flex items-start gap-2 text-xs">
                                <Badge variant={note.kind === "risk" ? "destructive" : "outline"} className="shrink-0 text-[10px]">
                                    {ARCHITECT_NOTE_KIND_LABELS[note.kind]}
                                </Badge>
                                <span className="text-muted-foreground">{note.text}</span>
                            </li>
                        ))}
                    </motion.ul>
                )}
            </AnimatePresence>
        </div>
    )
}
