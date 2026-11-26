"use client"

import { motion } from "framer-motion"
import { Bot, Info, User } from "lucide-react"
import { cn } from "@/lib/utils"

export type SimulationLine =
    | { id: string; kind: "text"; author: "contact" | "secretary"; text: string }
    /** O Secretário não responderia (ou só observaria): linha discreta com o motivo. */
    | { id: string; kind: "note"; text: string }

const bubble = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.18 } }

export { bubble as simulationBubble }

/** Uma linha da conversa simulada: balão do contato, do Secretário ou a nota de "não responderia". */
export function SimulationMessage({ line }: { line: SimulationLine }) {
    if (line.kind === "note") {
        return <motion.li {...bubble} className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground" data-testid="simulation-note">
            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden /> {line.text}
        </motion.li>
    }
    const contact = line.author === "contact"
    return (
        <motion.li {...bubble} className={cn("flex items-end gap-2", contact ? "justify-end" : "justify-start")}>
            {!contact && <Bot className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
            <span className={cn("max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm shadow-sm", contact ? "bg-primary text-primary-foreground" : "bg-card")}>{line.text}</span>
            {contact && <User className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
        </motion.li>
    )
}
