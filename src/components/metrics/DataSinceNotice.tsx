"use client"

import { AnimatePresence, motion } from "framer-motion"
import { format } from "date-fns"
import { CalendarClock } from "lucide-react"

/** "Dados desde dd/mm/aaaa": data a partir da qual uma métrica não retroativa passou a ser registrada. */
export function formatDataSince(since: string): string {
    return `Dados desde ${format(new Date(since), "dd/MM/yyyy")}`
}

/** Avisos "Dados desde" das métricas não retroativas da página. */
export function DataSinceNotice({ notices }: { notices: readonly { label: string; since: string }[] }) {
    return (
        <AnimatePresence initial={false}>
            {notices.length > 0 && (
                <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="space-y-1 overflow-hidden" aria-label="Desde quando há dados">
                    {notices.map((notice) => (
                        <li key={notice.label} className="flex items-center gap-2 text-xs text-muted-foreground">
                            <CalendarClock className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                            <span>
                                {notice.label}: {formatDataSince(notice.since)}
                            </span>
                        </li>
                    ))}
                </motion.ul>
            )}
        </AnimatePresence>
    )
}
