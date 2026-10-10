"use client"

import Link from "next/link"
import { format, formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { integrationPath } from "@/lib/integrations/catalog"
import { cn } from "@/lib/utils"
import { useGithubSyncStatus, useRunGithubSync } from "../../hooks/useGithub"
import { NotConfiguredHint } from "../shared"

const when = (iso: string | null) => (iso ? formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR }) : "—")

/** Aba Sincronização: rotina dos Crons e resultado por vínculo. */
export function GithubSyncTab({ configured }: { configured: boolean }) {
    const status = useGithubSyncStatus()
    const run = useRunGithubSync()
    if (!configured) return <NotConfiguredHint />
    const job = status.data?.job

    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                    <CardTitle className="text-base">Rotina &quot;Sincronizar issues do GitHub&quot;</CardTitle>
                    <CardDescription>
                        Agendada em <Link href={integrationPath("crons")} className="text-primary hover:underline">Integrações › Crons</Link>. A primeira leitura de cada vínculo importa as issues abertas; depois, só o que mudou.
                    </CardDescription>
                </div>
                <Button type="button" size="sm" className="gap-1.5" disabled={run.isPending} onClick={() => run.mutate()}>
                    {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
                    Sincronizar agora
                </Button>
            </CardHeader>
            <CardContent className="space-y-3">
                {status.isLoading ? (
                    <Skeleton className="h-24 w-full" />
                ) : status.isError ? (
                    <ErrorState title="Não foi possível carregar a sincronização" description={apiErrorMessage(status.error, "Tente novamente.")} onRetry={() => void status.refetch()} />
                ) : (
                    <>
                        <dl className="grid gap-2 text-sm sm:grid-cols-3">
                            <div>
                                <dt className="text-xs text-muted-foreground">Situação</dt>
                                <dd>{job ? (job.enabled ? "Ativa" : "Desativada (ou agendador desligado)") : "Não encontrada"}</dd>
                            </div>
                            <div>
                                <dt className="text-xs text-muted-foreground">Última execução</dt>
                                <dd className={cn(job?.lastStatus === "error" && "text-destructive")} title={job?.lastError ?? undefined}>
                                    {when(job?.lastFinishedAt ?? job?.lastRunAt ?? null)}
                                    {job?.lastStatus === "error" && " (com erro)"}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-xs text-muted-foreground">Próxima</dt>
                                <dd>{job?.nextRunAt ? format(new Date(job.nextRunAt), "HH:mm", { locale: ptBR }) : "—"}</dd>
                            </div>
                        </dl>
                        <ul className="divide-y rounded-md border">
                            {(status.data?.links ?? []).length === 0 && <li className="p-3 text-sm text-muted-foreground">Nenhum vínculo: crie um na aba Vínculos.</li>}
                            {(status.data?.links ?? []).map((link) => (
                                <li key={link.id} className="flex items-start gap-2 p-3 text-sm">
                                    {link.lastSync ? (
                                        link.lastSync.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="OK" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-label="Falhou" />
                                    ) : (
                                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
                                    )}
                                    <div className="min-w-0">
                                        <p className="font-mono text-xs font-semibold">
                                            {link.repo}
                                            {!link.enabled && <span className="ml-2 font-sans font-normal text-muted-foreground">(desativado)</span>}
                                        </p>
                                        <p className="text-xs text-muted-foreground">{link.lastSync ? `${when(link.lastSync.at)}: ${link.lastSync.message}` : "Ainda não lido"}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </CardContent>
        </Card>
    )
}
