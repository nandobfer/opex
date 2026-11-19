"use client"

import { motion } from "framer-motion"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { DebugStreamMode } from "../hooks/useDebugLogStream"

export function RealtimeIndicator({ mode }: { mode: DebugStreamMode }) {
    const live = mode === "realtime"
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <motion.span
                        key={mode}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={cn(
                            "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                            live
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                : "bg-muted text-muted-foreground",
                        )}
                        tabIndex={0}
                    >
                        <span className="relative flex h-2 w-2">
                            {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
                            <span className={cn("relative inline-flex h-2 w-2 rounded-full", live ? "bg-emerald-500" : "bg-slate-400")} />
                        </span>
                        {live ? "Tempo real" : "Sem tempo real"}
                    </motion.span>
                </TooltipTrigger>
                <TooltipContent>
                    {live
                        ? "Novos eventos aparecem automaticamente"
                        : "Tempo real indisponível: use Atualizar para buscar novos eventos"}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
