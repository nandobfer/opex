"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArchiveRestore, ArrowLeft, CalendarDays, FileSearch, Loader2, Pencil, RefreshCw, Trash2, Wallet } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Markdown } from "@/components/ui/markdown"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorCode, apiErrorMessage } from "@/lib/api"
import { GithubRepoLabel } from "@/features/github/components/shared"
import { useRepoIndex } from "@/features/github/components/RepoIndexProvider"
import { repoLabelFrom } from "@/features/orcamentos/logic"
import { clienteConfigPath } from "@/features/orcamentos/constants"
import { AttachmentList } from "@/features/tasks/attachments/components/AttachmentList"
import { useDeleteAttachment, useOwnerAttachmentClient, useTaskAttachments } from "@/features/tasks/attachments/hooks"
import { taskPath } from "@/features/tasks/constants"
import { formatDate } from "@/features/tasks/format"
import { formatBillingBrl, formatHours } from "@/features/finance/format"
import { SERVICES_PATH, serviceEditPath } from "../constants"
import { useArchiveService, useRestoreService, useService, useServicesRealtime } from "../hooks"
import { ServiceAiPanel } from "./ServiceAiPanel"

/**
 * Detalhe de um serviço (`/financeiro/servicos/[id]`): código + badge "Serviço", título/summary,
 * descrição completa, cliente, repositório, tarefa vinculada (quando houver), data, horas real e
 * inflada, faturamento, tags e anexos, com **Editar** e **Excluir** (soft delete) — ou **Restaurar**
 * quando arquivado.
 */
export function ServiceDetailPage({ id }: { id: string }) {
    const reduceMotion = useReducedMotion()
    const router = useRouter()
    const query = useService(id)
    useServicesRealtime()
    const repoIndex = useRepoIndex()
    const attachmentClient = useOwnerAttachmentClient()
    const attachments = useTaskAttachments(attachmentClient, { serviceId: id }, Boolean(id))
    const removeAttachment = useDeleteAttachment(attachmentClient)
    const archive = useArchiveService()
    const restore = useRestoreService()
    const [confirmDelete, setConfirmDelete] = useState(false)

    const service = query.data
    const view = query.isLoading ? "loading" : query.isError ? (apiErrorCode(query.error) === "SERVICE_NOT_FOUND" ? "missing" : "error") : "ready"
    const canDeleteAttachment = attachments.data !== undefined

    return (
        <motion.section initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
            <div className="flex items-center justify-between gap-2">
                <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5">
                    <Link href={SERVICES_PATH}>
                        <ArrowLeft className="h-4 w-4" aria-hidden /> Financeiro
                    </Link>
                </Button>
                <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => void query.refetch()} disabled={query.isFetching} aria-label="Atualizar serviço">
                    <motion.span animate={{ rotate: query.isFetching ? 360 : 0 }} transition={query.isFetching ? { repeat: Infinity, duration: 0.9, ease: "linear" } : { duration: 0.2 }} className="inline-flex">
                        <RefreshCw className="h-4 w-4" aria-hidden />
                    </motion.span>
                    Atualizar
                </Button>
            </div>

            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                    {view === "loading" && (
                        <div className="grid gap-4 lg:grid-cols-[1fr_320px]" aria-label="Carregando serviço">
                            <Skeleton className="h-64 w-full" />
                            <Skeleton className="h-96 w-full" />
                        </div>
                    )}
                    {view === "missing" && (
                        <EmptyState icon={FileSearch} title="Serviço não encontrado" description="Ele pode ter sido removido ou o endereço está incorreto.">
                            <Button asChild size="sm" variant="outline">
                                <Link href={SERVICES_PATH}>Voltar para o Financeiro</Link>
                            </Button>
                        </EmptyState>
                    )}
                    {view === "error" && <ErrorState title="Não foi possível carregar o serviço" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />}
                    {view === "ready" && service && (
                        <div className="space-y-4">
                            <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div className="min-w-0 space-y-1.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant="secondary">Serviço</Badge>
                                        <span className="font-mono text-sm font-semibold text-primary">{service.code}</span>
                                        {service.archived && <Badge variant="outline">Arquivado</Badge>}
                                    </div>
                                    <h1 className="text-xl font-semibold leading-tight md:text-2xl">{service.title ?? service.summary ?? "Serviço"}</h1>
                                </div>
                                <div className="flex shrink-0 flex-wrap items-center gap-2">
                                    <Button asChild variant="outline" size="sm" className="h-9 gap-1.5">
                                        <Link href={serviceEditPath(service.id)}>
                                            <Pencil className="h-4 w-4" aria-hidden /> Editar
                                        </Link>
                                    </Button>
                                    {service.archived ? (
                                        <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => restore.mutate(service.id)} disabled={restore.isPending}>
                                            {restore.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArchiveRestore className="h-4 w-4" aria-hidden />}
                                            Restaurar
                                        </Button>
                                    ) : (
                                        <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                                            <Trash2 className="h-4 w-4" aria-hidden /> Excluir
                                        </Button>
                                    )}
                                </div>
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
                                                canDelete={canDeleteAttachment}
                                                deleting={removeAttachment.isPending}
                                                onDelete={(attachment) => removeAttachment.mutate(attachment)}
                                            />
                                        </CardContent>
                                    </Card>
                                </div>

                                <div className="min-w-0 space-y-4">
                                    <Card>
                                        <CardContent className="pt-4">
                                            <ServiceAiPanel service={service} />
                                        </CardContent>
                                    </Card>
                                    <Card>
                                        <CardContent className="space-y-3 pt-4 text-sm">
                                            <Row label="Cliente">
                                                <Link href={clienteConfigPath(service.clientId)} className="text-primary hover:underline">
                                                    {service.clientName ?? "Cliente removido"}
                                                </Link>
                                            </Row>
                                            <Row label="Repositório">
                                                {service.project ? <GithubRepoLabel repo={repoLabelFrom(service.project.repo, repoIndex)} /> : <span className="text-muted-foreground">Sem repositório</span>}
                                            </Row>
                                            <Row label="Tarefa">
                                                {service.task ? (
                                                    service.task.exists ? (
                                                        <Link href={taskPath(service.task.id)} className="text-primary hover:underline">
                                                            {service.task.code}
                                                        </Link>
                                                    ) : (
                                                        <span className="text-muted-foreground">Tarefa removida</span>
                                                    )
                                                ) : (
                                                    <span className="text-muted-foreground">Sem tarefa</span>
                                                )}
                                            </Row>
                                            <Row label="Data">
                                                <span className="inline-flex items-center gap-1.5">
                                                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                                                    {formatDate(service.serviceDate)}
                                                </span>
                                            </Row>
                                            <Row label="Duração do serviço">{formatHours(service.hours)} h</Row>
                                            <Row label="Duração inflada">{formatHours(service.clientHours)} h</Row>
                                            <Row label="Faturamento">
                                                <span className="inline-flex items-center gap-1 font-mono font-semibold text-success">
                                                    <Wallet className="h-3.5 w-3.5" aria-hidden />
                                                    {formatBillingBrl(service.billingBrl)}
                                                </span>
                                            </Row>
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>

            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir o serviço {service?.code}?</AlertDialogTitle>
                        <AlertDialogDescription>O serviço é arquivado (soft delete): some das somas, listas, dashboards e portal, mas pode ser restaurado depois com o filtro &quot;Mostrar arquivados&quot;.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (service) archive.mutate(service.id, { onSuccess: () => router.push(SERVICES_PATH) })
                            }}
                        >
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </motion.section>
    )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-3">
            <span className="text-muted-foreground">{label}</span>
            <span className="min-w-0 text-right">{children}</span>
        </div>
    )
}
