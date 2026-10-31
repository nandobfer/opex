"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronRight } from "lucide-react"
import { ENGRAMIND_ABOUT_TOPICS, ENGRAMIND_SUMMARY } from "../../help/about"

/** "Sobre o Engramind": resumo e os tópicos detalhados, cada um expansível. */
export function AboutContent({ compact = false }: { compact?: boolean }) {
    const [open, setOpen] = useState<string | null>(null)
    return (
        <div className="space-y-4">
            <p className="text-sm leading-relaxed text-foreground/90">{ENGRAMIND_SUMMARY}</p>
            <ul className="divide-y rounded-lg border">
                {ENGRAMIND_ABOUT_TOPICS.map((topic) => {
                    const expanded = open === topic.id
                    return (
                        <li key={topic.id}>
                            <button
                                type="button"
                                aria-expanded={expanded}
                                onClick={() => setOpen(expanded ? null : topic.id)}
                                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-muted/50"
                            >
                                <motion.span animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.15 }} aria-hidden>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                </motion.span>
                                {topic.title}
                            </button>
                            <AnimatePresence initial={false}>
                                {expanded && (
                                    <motion.div key="body" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                        <div className={compact ? "space-y-2 px-9 pb-3 text-xs text-muted-foreground" : "space-y-2 px-9 pb-3 text-sm text-muted-foreground"}>
                                            {topic.paragraphs.map((paragraph) => (
                                                <p key={paragraph}>{paragraph}</p>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}
