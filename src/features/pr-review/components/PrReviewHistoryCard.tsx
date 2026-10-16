"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import type { UseQueryResult } from "@tanstack/react-query"
import { FolderGit2, GitPullRequest, Plus } from "lucide-react"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { usePrReviewAction, usePrReviewRealtime } from "../hooks/usePrReview"
import type { PrReviewListDto } from "../types"
import { PrReviewRow } from "./PrReviewRow"
import { PrReviewDetailDialog } from "./PrReviewDetailDialog"
import { RequestPrReviewDialog } from "./RequestPrReviewDialog"

/** Histórico das revisões (as 50 mais recentes), com a saída ao vivo, "Revisar de novo" e "Parar". */
export function PrReviewHistoryCard({ query, available }: { query: UseQueryResult<PrReviewListDto>; available: boolean }) {
    usePrReviewRealtime()
    const action = usePrReviewAction()
    const [openId, setOpenId] = useState<string | null>(null)
    const [stopId, setStopId] = useState<string | null>(null)
    const [requesting, setRequesting] = useState(false)
    const repos = query.data?.repos ?? []

    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div className="space-y-1.5">
                    <CardTitle className="text-base">Revisões</CardTitle>
                    <CardDescription>As 50 mais recentes. Atualiza em tempo real.</CardDescription>
                </div>
                <Button type="button" size="sm" className="gap-1.5" disabled={!available} onClick={() => setRequesting(true)}>
                    <Plus className="h-4 w-4" aria-hidden /> Revisar PR
                </Button>
            </CardHeader>
            <CardContent className="space-y-4">
                {repos.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {repos.map((repo) => (
                            <span key={repo.repo} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
                                <FolderGit2 className="h-3.5 w-3.5 text-primary" aria-hidden />
                                <span className="font-mono">{repo.repo}</span>
                                <span className="text-muted-foreground">{repo.projectName}</span>
                                {!repo.enabled && <span className="rounded bg-muted px-1.5 text-[11px] text-muted-foreground">central desativada</span>}
                            </span>
                        ))}
                    </div>
                )}
                {query.isLoading ? (
                    <Skeleton className="h-32 w-full" />
                ) : query.isError || !query.data ? (
                    <ErrorState title="Não foi possível carregar as revisões" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
                ) : query.data.items.length === 0 ? (
                    <EmptyState
                        icon={GitPullRequest}
                        title="Nenhuma revisão ainda"
                        description={repos.length ? "As revisões aparecem aqui quando a rotina de PRs encontrar PRs que atendem ao critério." : "Crie uma central de desenvolvimento com repositório vinculado para revisar os PRs dele."}
                        actionLabel={available ? "Revisar PR" : undefined}
                        onAction={available ? () => setRequesting(true) : undefined}
                    />
                ) : (
                    <ul className="space-y-2">
                        <AnimatePresence initial={false}>
                            {query.data.items.map((review) => (
                                <motion.li key={review.id} layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                                    <PrReviewRow
                                        review={review}
                                        available={available}
                                        busy={action.isPending}
                                        onOpen={() => setOpenId(review.id)}
                                        onRerun={() => action.mutate({ id: review.id, action: "rerun" })}
                                        onStop={() => setStopId(review.id)}
                                    />
                                </motion.li>
                            ))}
                        </AnimatePresence>
                    </ul>
                )}
            </CardContent>

            <PrReviewDetailDialog id={openId} onClose={() => setOpenId(null)} />
            <RequestPrReviewDialog open={requesting} onOpenChange={setRequesting} />
            <AlertDialog open={stopId !== null} onOpenChange={(open) => !open && setStopId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Parar a revisão?</AlertDialogTitle>
                        <AlertDialogDescription>Revisão na fila sai da fila; em andamento, o agente é interrompido (o que já foi publicado no GitHub permanece).</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (stopId) action.mutate({ id: stopId, action: "stop" })
                                setStopId(null)
                            }}
                        >
                            Parar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    )
}
