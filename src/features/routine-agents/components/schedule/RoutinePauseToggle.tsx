"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Pause, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useRoutineAgentStatus } from "../../hooks/useRoutineAgents"
import type { RoutineAgentDto } from "../../types"

/**
 * Pausar/Retomar o agente (OPE-213), na lista `/agentes-rotineiros` e na página do agente. Resposta otimista pelo
 * `useRoutineAgentStatus`; não aparece para agente arquivado.
 */
export function RoutinePauseToggle({ agent, className }: { agent: Pick<RoutineAgentDto, "id" | "status" | "title">; className?: string }) {
    const status = useRoutineAgentStatus()
    if (agent.status === "archived") return null
    const paused = agent.status === "paused"
    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("h-9 gap-1.5", className)}
            disabled={status.isPending}
            onClick={() => status.mutate({ id: agent.id, action: paused ? "resume" : "pause" })}
            aria-label={`${paused ? "Retomar" : "Pausar"} o ${agent.title}`}
        >
            <AnimatePresence mode="wait" initial={false}>
                <motion.span key={paused ? "resume" : "pause"} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.15 }} className="inline-flex">
                    {paused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
                </motion.span>
            </AnimatePresence>
            {paused ? "Retomar" : "Pausar"}
        </Button>
    )
}
