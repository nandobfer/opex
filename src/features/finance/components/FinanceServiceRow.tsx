"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { CalendarDays, Wallet } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { listItem } from "@/components/motion/presets"
import { GithubRepoLabel } from "@/features/github/components/shared"
import { useRepoIndex } from "@/features/github/components/RepoIndexProvider"
import { repoLabelFrom } from "@/features/orcamentos/logic"
import { serviceDetailPath } from "@/features/services/constants"
import { formatDate } from "@/features/tasks/format"
import { formatBillingBrl, formatHours } from "../format"
import type { FinanceServiceDto } from "../types"

/**
 * Um serviço no Financeiro: badge "Serviço", código (link para o detalhe), título, repositório, data
 * do serviço e os valores (horas reais, horas infladas e faturamento em R$). Arquivado recebe o badge
 * "Arquivado" e fica fora dos totais.
 */
export function FinanceServiceRow({ service }: { service: FinanceServiceDto }) {
    const repoIndex = useRepoIndex()

    return (
        <motion.li layout="position" variants={listItem} className="rounded-lg border bg-card p-3" data-testid={`finance-service-${service.id}`}>
            <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <Badge variant="secondary" className="shrink-0">
                            Serviço
                        </Badge>
                        {service.archived && (
                            <Badge variant="outline" className="shrink-0">
                                Arquivado
                            </Badge>
                        )}
                        <Link href={serviceDetailPath(service.id)} className="font-mono text-xs font-semibold text-primary hover:underline">
                            {service.code}
                        </Link>
                        {service.title && (
                            <span className="truncate text-sm font-medium" title={service.title}>
                                {service.title}
                            </span>
                        )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        {service.project && (
                            <span className="inline-flex min-w-0 max-w-[220px]">
                                <GithubRepoLabel repo={repoLabelFrom(service.project.repo, repoIndex)} />
                            </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" aria-hidden />
                            {formatDate(service.serviceDate)}
                        </span>
                    </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-0.5 text-xs text-muted-foreground max-md:w-full max-md:basis-full max-md:justify-start max-md:border-t max-md:pt-2" data-testid="finance-service-values">
                    <span title="Horas infladas (H × fator)">{formatHours(service.clientHours)}</span>
                    <span title="Horas reais (H)">{formatHours(service.hours)}</span>
                    <span className="inline-flex items-center gap-1 font-mono text-sm font-semibold text-success">
                        <Wallet className="h-3.5 w-3.5" aria-hidden />
                        {formatBillingBrl(service.billingBrl)}
                    </span>
                </div>
            </div>
        </motion.li>
    )
}
