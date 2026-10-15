"use client"

import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"
import { ArrowLeft, CalendarDays, FileSearch, Wallet } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Markdown } from "@/components/ui/markdown"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorCode, apiErrorMessage } from "@/lib/api"
import { GithubRepoLabel } from "@/features/github/components/shared"
import { AttachmentList } from "@/features/tasks/attachments/components/AttachmentList"
import { useTaskAttachments } from "@/features/tasks/attachments/hooks"
import { formatBillingBrl, formatHours } from "@/features/finance/format"
import { formatDate } from "@/features/tasks/format"
import { CLIENTE_COST_LABEL, clienteFinanceiroPath } from "../constants"
import { repoLabelFrom } from "../logic"
import { useClienteAttachmentClient, useClienteService } from "./hooks"

/**
 * Detalhe de um serviço no portal (`/cliente/servicos/[id]`): descrição, anexos (visíveis e
 * baixáveis) e o **custo** com as horas infladas. Nunca mostra horas reais, fator, custo/hora ou
 * modelo (dados internos do dono).
 */
export function ClienteServiceDetailPage({ id }: { id: string }) {
    const reduceMotion = useReducedMotion()
    const query = useClienteService(id)
    const attachmentClient = useClienteAttachmentClient()
    const attachments = useTaskAttachments(attachmentClient, { serviceId: id }, Boolean(id))

    const service = query.data
    const view = query.isLoading ? "loading" : query.isError ? (apiErrorCode(query.error) === "SERVICE_NOT_FOUND" ? "missing" : "error") : "ready"

    return (
        <motion.section initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
            <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5">
                <Link href={clienteFinanceiroPath()}>
                    <ArrowLeft className="h-4 w-4" aria-hidden /> Financeiro
                </Link>
            </Button>

            {view === "loading" && <Skeleton className="h-64 w-full" aria-label="Carregando serviço" />}
            {view === "missing" && (
                <EmptyState icon={FileSearch} title="Serviço não encontrado" description="Ele pode ter sido removido ou o endereço está incorreto.">
                    <Button asChild size="sm" variant="outline">
                        <Link href={clienteFinanceiroPath()}>Voltar para o Financeiro</Link>
                    </Button>
                </EmptyState>
            )}
            {view === "error" && <ErrorState title="Não foi possível carregar o serviço" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />}
            {view === "ready" && service && (
                <div className="space-y-4">
                    <header className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">Serviço</Badge>
                            <span className="font-mono text-sm font-semibold text-primary">{service.code}</span>
                        </div>
                        <h1 className="text-xl font-semibold leading-tight md:text-2xl">{service.title ?? service.summary ?? "Serviço"}</h1>
                    </header>

                    <div className="grid items-start gap-4 lg:grid-cols-[1fr_320px]">
                        <div className="min-w-0 space-y-4">
                            <Card>
                                <CardContent className="space-y-3 pt-4">
                                    <h2 className="text-sm font-semibold">Descrição</h2>
                                    {service.description.trim() ? <Markdown>{service.description}</Markdown> : <p className="text-sm text-muted-foreground">Sem descrição.</p>}
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="space-y-3 pt-4">
                                    <h2 className="text-sm font-semibold">Anexos</h2>
                                    <AttachmentList
                                        attachments={attachments.data ?? []}
                                        description={service.description}
                                        loading={attachments.isLoading}
                                        error={attachments.isError ? apiErrorMessage(attachments.error, "Não foi possível carregar os anexos.") : null}
                                        onRetry={() => void attachments.refetch()}
                                    />
                                </CardContent>
                            </Card>
                        </div>
                        <Card>
                            <CardContent className="space-y-3 pt-4 text-sm">
                                {service.repo && (
                                    <div className="flex items-start justify-between gap-3">
                                        <span className="text-muted-foreground">Repositório</span>
                                        <span className="min-w-0 max-w-[200px]">
                                            <GithubRepoLabel repo={repoLabelFrom(service.repo)} />
                                        </span>
                                    </div>
                                )}
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-muted-foreground">Data</span>
                                    <span className="inline-flex items-center gap-1.5">
                                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                                        {formatDate(service.serviceDate)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-muted-foreground">Horas</span>
                                    <span>{formatHours(service.clientHours)} h</span>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-muted-foreground">{CLIENTE_COST_LABEL}</span>
                                    <span className="inline-flex items-center gap-1 font-mono font-semibold text-success">
                                        <Wallet className="h-3.5 w-3.5" aria-hidden />
                                        {formatBillingBrl(service.billingBrl)}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}
        </motion.section>
    )
}
