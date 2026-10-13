"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { CalendarDays, Wallet } from "lucide-react"
import { listItem } from "@/components/motion/presets"
import { GithubRepoLabel } from "@/features/github/components/shared"
import { useRepoIndex } from "@/features/github/components/RepoIndexProvider"
import { repoLabelFrom } from "@/features/orcamentos/logic"
import { taskPath } from "@/features/tasks/constants"
import { formatDate } from "@/features/tasks/format"
import { formatBillingBrl, formatHours } from "../format"
import type { FinanceTaskDto } from "../types"

/**
 * Uma tarefa concluída no Financeiro: código (link para a tarefa), título, repositório, data de
 * conclusão e os valores (horas reais, horas do cliente e faturamento em R$).
 */
export function FinanceTaskRow({ task }: { task: FinanceTaskDto }) {
    const repoIndex = useRepoIndex()

    return (
        <motion.li layout="position" variants={listItem} className="rounded-lg border bg-card p-3" data-testid={`finance-task-${task.id}`}>
            <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <Link href={taskPath(task.id)} className="font-mono text-xs font-semibold text-primary hover:underline">
                            {task.code}
                        </Link>
                        <span className="truncate text-sm font-medium" title={task.title}>
                            {task.title}
                        </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        {task.project && (
                            <span className="inline-flex min-w-0 max-w-[220px]">
                                <GithubRepoLabel repo={repoLabelFrom(task.project.repo, repoIndex)} />
                            </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" aria-hidden />
                            {formatDate(task.completedAt)}
                        </span>
                    </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-0.5 text-xs text-muted-foreground max-md:w-full max-md:basis-full max-md:justify-start max-md:border-t max-md:pt-2" data-testid="finance-task-values">
                    <span title="Horas do cliente (H × fator)">{formatHours(task.clientHours)}</span>
                    <span title="Horas reais (H)">{formatHours(task.hours)}</span>
                    <span className="inline-flex items-center gap-1 font-mono text-sm font-semibold text-success">
                        <Wallet className="h-3.5 w-3.5" aria-hidden />
                        {formatBillingBrl(task.billingBrl)}
                    </span>
                </div>
            </div>
        </motion.li>
    )
}
