"use client"

import { useState } from "react"
import { Ban } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Markdown } from "@/components/ui/markdown"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { ROUTINE_TRIGGER_ORIGIN_LABELS, canCancelRun } from "../../status"
import { formatCost, formatDateTime, formatDuration, formatTime, formatTokens } from "../../format"
import { useCancelRoutineRun, useResolveRoutineAction, useRoutineRun } from "../../hooks/useRoutineRuns"
import { RoutineRunStatusBadge } from "../RoutineBadges"
import { RoutinePendingAction } from "./RoutinePendingAction"
import { RoutineRunSteps } from "./RoutineRunSteps"

function Info({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-sm">{value}</p>
        </div>
    )
}

/** Detalhe da execução: passos, ferramentas usadas, relato final e a ação pendente (Confirmar/Recusar). */
export function RoutineRunDetailSheet({ agentId, runId, onClose }: { agentId: string; runId: string | null; onClose: () => void }) {
    const query = useRoutineRun(runId)
    const cancel = useCancelRoutineRun(agentId)
    const resolve = useResolveRoutineAction(agentId)
    const [confirmCancel, setConfirmCancel] = useState(false)
    const run = query.data
    return (
        <Sheet open={Boolean(runId)} onOpenChange={(open) => !open && onClose()}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        Execução {run ? `#${run.seq}` : ""} {run && <RoutineRunStatusBadge status={run.status} />}
                    </SheetTitle>
                    <SheetDescription>{run ? `${ROUTINE_TRIGGER_ORIGIN_LABELS[run.origin]} · ${run.engine === "opex" ? "motor Opex" : "OpenCode no host"}${run.model ? ` · ${run.model}` : ""}` : "Carregando…"}</SheetDescription>
                </SheetHeader>
                {query.isLoading ? (
                    <Skeleton className="mt-4 h-96 w-full" />
                ) : query.isError || !run ? (
                    <ErrorState title="Não foi possível carregar a execução" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
                ) : (
                    <div className="space-y-5 p-4">
                        <div className="grid grid-cols-2 gap-3">
                            <Info label="Início" value={formatDateTime(run.startedAt ?? run.queuedAt)} />
                            <Info label="Fim" value={formatDateTime(run.finishedAt)} />
                            <Info label="Duração ativa" value={formatDuration(run.activeMs)} />
                            <Info label="Esperando" value={formatDuration(run.waitingMs)} />
                            <Info label="Tokens" value={formatTokens(run.tokens)} />
                            <Info label="Custo" value={formatCost(run.costUsd, run.costPartial)} />
                        </div>
                        {run.hibernation && run.status === "hibernating" && (
                            <p className="rounded-md bg-muted p-2 text-sm">
                                Próxima verificação às {formatTime(run.hibernation.at)}: {run.hibernation.reason}
                            </p>
                        )}
                        {run.pendingAction && <RoutinePendingAction action={run.pendingAction} pending={resolve.isPending} onResolve={(decision) => resolve.mutate({ runId: run.id, decision })} />}
                        {run.request && (
                            <section className="space-y-1">
                                <h3 className="text-xs font-semibold">Solicitação</h3>
                                <p className="whitespace-pre-wrap text-sm">{run.request}</p>
                            </section>
                        )}
                        {run.error && <p className="rounded-md border border-destructive/40 p-2 text-sm text-destructive">{run.error}</p>}
                        {run.report && (
                            <section className="space-y-1">
                                <h3 className="text-xs font-semibold">Relato final</h3>
                                <Markdown className="text-sm">{run.report}</Markdown>
                            </section>
                        )}
                        {run.warnings.length > 0 && (
                            <ul className="space-y-1 text-xs text-warning">
                                {run.warnings.map((warning) => (
                                    <li key={warning}>{warning}</li>
                                ))}
                            </ul>
                        )}
                        {run.tools.length > 0 && (
                            <section className="space-y-1">
                                <h3 className="text-xs font-semibold">Ferramentas usadas</h3>
                                <ul className="flex flex-wrap gap-1.5">
                                    {run.tools.map((tool) => (
                                        <li key={tool.name} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                                            <code>{tool.name}</code> × {tool.count}
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}
                        <section className="space-y-2">
                            <h3 className="text-xs font-semibold">Passos</h3>
                            <RoutineRunSteps steps={run.steps} />
                        </section>
                        {canCancelRun(run.status) && (
                            <Button type="button" variant="outline" className="w-full gap-1.5" onClick={() => setConfirmCancel(true)}>
                                <Ban className="h-4 w-4" aria-hidden /> Cancelar execução
                            </Button>
                        )}
                    </div>
                )}
                <ConfirmDialog
                    open={confirmCancel}
                    onOpenChange={setConfirmCancel}
                    title="Cancelar esta execução?"
                    description="O turno é interrompido (ou a espera encerrada) e a execução termina como Cancelada."
                    confirmLabel="Cancelar execução"
                    variant="destructive"
                    pending={cancel.isPending}
                    onConfirm={() => run && cancel.mutate(run.id, { onSettled: () => setConfirmCancel(false) })}
                />
            </SheetContent>
        </Sheet>
    )
}
