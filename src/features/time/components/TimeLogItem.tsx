"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { format } from "date-fns"
import { Bot, Coins, Cpu, Hash } from "lucide-react"
import { listItem } from "@/components/motion/presets"
import { cn } from "@/lib/utils"
import { taskPath } from "@/features/tasks/constants"
import { formatMinutes } from "@/features/tasks/format"
import { formatCostUsd, formatTokens } from "../format"
import type { TimeLogDto } from "../types"
import { RunningClock } from "./RunningClock"

const hour = (iso: string) => format(new Date(iso), "HH:mm")

/** Um apontamento **somente leitura**: tarefa, período, duração e o uso (agente/modelo/tokens/custo). */
export function TimeLogItem({ log }: { log: TimeLogDto }) {
    const tokens = log.inputTokens + log.outputTokens + log.reasoningTokens

    return (
        <motion.li
            layout="position"
            variants={listItem}
            className={cn("rounded-lg border bg-card p-3 transition-colors", log.active && "border-success/60 bg-success/5")}
            data-testid={`time-log-${log.id}`}
        >
            <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {log.taskId && log.taskCode ? (
                            <Link href={taskPath(log.taskId)} className="font-mono text-xs font-semibold text-primary hover:underline">
                                {log.taskCode}
                            </Link>
                        ) : null}
                        <span className="truncate text-sm font-medium" title={log.taskTitle ?? undefined}>
                            {log.taskTitle ?? "Sem tarefa"}
                        </span>
                    </div>

                    <p className={cn("mt-1 text-sm", !log.description && "italic text-muted-foreground")}>{log.description ?? "Sem descrição"}</p>

                    {(log.agent || log.model || tokens > 0 || log.costUsd > 0) && (
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            {log.agent && (
                                <span className="inline-flex items-center gap-1">
                                    <Bot className="h-3 w-3" aria-hidden />
                                    {log.agent}
                                </span>
                            )}
                            {log.model && (
                                <span className="inline-flex items-center gap-1">
                                    <Cpu className="h-3 w-3" aria-hidden />
                                    {log.model}
                                </span>
                            )}
                            {tokens > 0 && (
                                <span className="inline-flex items-center gap-1">
                                    <Hash className="h-3 w-3" aria-hidden />
                                    {formatTokens(tokens)} tokens
                                </span>
                            )}
                            {log.costUsd > 0 && (
                                <span className="inline-flex items-center gap-1">
                                    <Coins className="h-3 w-3" aria-hidden />
                                    {formatCostUsd(log.costUsd)}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex shrink-0 items-center gap-3 max-md:w-full max-md:basis-full max-md:justify-between max-md:border-t max-md:pt-2" data-testid="time-log-period">
                    <span className="text-xs tabular-nums text-muted-foreground">
                        {hour(log.startTime)} – {log.endTime ? hour(log.endTime) : "agora"}
                    </span>
                    {log.active ? (
                        <span className="inline-flex items-center gap-1.5 rounded bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
                            <motion.span className="h-1.5 w-1.5 rounded-full bg-success" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }} aria-hidden />
                            <RunningClock startTime={log.startTime} />
                        </span>
                    ) : (
                        <span className="min-w-[64px] text-right font-mono text-sm font-semibold">{formatMinutes(log.duration)}</span>
                    )}
                </div>
            </div>
        </motion.li>
    )
}
