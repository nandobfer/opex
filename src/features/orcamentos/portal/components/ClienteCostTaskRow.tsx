"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { CalendarDays, Wallet } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { listItem } from "@/components/motion/presets"
import { GithubRepoLabel } from "@/features/github/components/shared"
import type { GithubRepoLabelData } from "@/features/github/types"
import { clienteServicoPath } from "@/features/services/constants"
import { repoLabelFrom } from "../../logic"
import { formatBillingBrl, formatHours } from "@/features/finance/format"
import { formatDate } from "@/features/tasks/format"
import type { ClienteCostTaskDto } from "../../types"

/**
 * Uma tarefa concluída no Financeiro do portal: código (link para a tarefa), título, repositório,
 * data de conclusão e os valores — **apenas** as horas infladas e o custo. Sem horas reais, fator ou
 * custo por hora (dados internos do dono).
 */
export function ClienteCostTaskRow({ task, repoIndex, href }: { task: ClienteCostTaskDto; repoIndex?: ReadonlyMap<string, GithubRepoLabelData>; href: string }) {
    const target = task.kind === "service" ? clienteServicoPath(task.id) : href
    return (
        <motion.li layout="position" variants={listItem} className="rounded-lg border bg-card p-3" data-testid={`cliente-cost-task-${task.id}`}>
            <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {task.kind === "service" && (
                            <Badge variant="secondary" className="shrink-0">
                                Serviço
                            </Badge>
                        )}
                        <Link href={target} className="font-mono text-xs font-semibold text-primary hover:underline">
                            {task.code}
                        </Link>
                        <span className="truncate text-sm font-medium" title={task.title}>
                            {task.title}
                        </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        {task.repo && (
                            <span className="inline-flex min-w-0 max-w-[220px]">
                                <GithubRepoLabel repo={repoLabelFrom(task.repo, repoIndex)} />
                            </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" aria-hidden />
                            {formatDate(task.completedAt)}
                        </span>
                    </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-0.5 text-xs text-muted-foreground max-md:w-full max-md:basis-full max-md:justify-start max-md:border-t max-md:pt-2" data-testid="cliente-cost-task-values">
                    <span title="Horas no período">{formatHours(task.clientHours)}</span>
                    <span className="inline-flex items-center gap-1 font-mono text-sm font-semibold text-success">
                        <Wallet className="h-3.5 w-3.5" aria-hidden />
                        {formatBillingBrl(task.costBrl)}
                    </span>
                </div>
            </div>
        </motion.li>
    )
}
