"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { FilterX, FolderGit2, GitPullRequest, Info, Loader2, Plus, Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { useUrlFilters } from "@/hooks/useUrlFilters"
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll"
import { apiErrorMessage } from "@/lib/api"
import { PR_REVIEW_SETTINGS_HREF } from "../constants"
import { DEFAULT_PR_REVIEW_FILTERS, hasPrReviewFilters, PR_REVIEW_FILTER_SCHEMA, toPrReviewListParams } from "../filters"
import { usePrReviewPages, usePrReviewRealtime, usePrReviewSettings } from "../hooks/usePrReview"
import { PrReviewFiltersBar } from "./PrReviewFiltersBar"
import { PrReviewList } from "./PrReviewList"
import { RequestPrReviewDialog } from "./RequestPrReviewDialog"

const swap = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.2 } }

/**
 * Agente Revisor (`/agente-revisor`): revisões dos PRs das centrais, mais recentes primeiro, com os
 * filtros na URL (recorte feito pela API), rolagem infinita e tempo real. Ações: Ver, Revisar de
 * novo, Parar e Revisar PR. A configuração fica em Integrações › Provedores de IA › Agente Revisor.
 */
export function PrReviewsPage() {
    const reduceMotion = useReducedMotion()
    usePrReviewRealtime()
    const [filters, setFilters, resetFilters] = useUrlFilters(DEFAULT_PR_REVIEW_FILTERS, PR_REVIEW_FILTER_SCHEMA)
    const params = useMemo(() => toPrReviewListParams(filters), [filters])
    const query = usePrReviewPages(params)
    const settings = usePrReviewSettings()
    const [requesting, setRequesting] = useState(false)
    const { sentinelRef, supported } = useInfiniteScroll({
        onLoadMore: () => void query.fetchNextPage(),
        disabled: !query.hasNextPage || query.isFetchingNextPage || query.isFetchNextPageError,
    })

    const pages = query.data?.pages ?? []
    const items = pages.flatMap((page) => page.items)
    const first = pages[0]
    const repos = first?.repos ?? []
    const total = first?.total ?? 0
    const availability = settings.data?.availability
    const available = availability?.available === true
    const filtering = hasPrReviewFilters(filters)
    const view = query.isLoading ? "loading" : query.isError ? "error" : items.length === 0 ? "empty" : "list"

    return (
        <motion.section initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
            <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
                        <GitPullRequest className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                        <h1 className="text-lg font-semibold md:text-2xl">Agente Revisor</h1>
                        <p className="text-sm text-muted-foreground">Revisões dos PRs das centrais. Atualiza em tempo real.</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button asChild variant="outline" size="sm" className="h-9 gap-1.5">
                        <Link href={PR_REVIEW_SETTINGS_HREF}>
                            <Settings2 className="h-4 w-4" aria-hidden /> Configurar
                        </Link>
                    </Button>
                    <Button type="button" size="sm" className="h-9 gap-1.5" disabled={!available} onClick={() => setRequesting(true)}>
                        <Plus className="h-4 w-4" aria-hidden /> Revisar PR
                    </Button>
                </div>
            </header>

            <AnimatePresence initial={false}>
                {availability && !available && availability.reason && (
                    <motion.p key="availability" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="flex items-start gap-2 overflow-hidden text-xs text-muted-foreground">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {availability.reason}
                    </motion.p>
                )}
            </AnimatePresence>

            {repos.length > 0 && (
                <div className="flex flex-wrap gap-2" aria-label="Repositórios acompanhados">
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

            <PrReviewFiltersBar filters={filters} setFilters={setFilters} onClear={resetFilters} total={total} repos={repos} />

            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={view} {...swap}>
                    {view === "loading" && (
                        <div className="space-y-2" aria-label="Carregando revisões">
                            <Skeleton className="h-20 w-full" />
                            <Skeleton className="h-20 w-full" />
                            <Skeleton className="h-20 w-full" />
                        </div>
                    )}
                    {view === "error" && <ErrorState title="Não foi possível carregar as revisões" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />}
                    {view === "empty" &&
                        (filtering ? (
                            <EmptyState icon={FilterX} title="Nenhuma revisão com estes filtros" description="Ajuste ou limpe os filtros para ver mais revisões." actionLabel="Limpar filtros" onAction={resetFilters} />
                        ) : (
                            <EmptyState
                                icon={GitPullRequest}
                                title="Nenhuma revisão ainda"
                                description={repos.length ? "As revisões aparecem aqui quando a rotina de PRs encontrar PRs que atendem ao critério." : "Crie uma central de desenvolvimento com repositório vinculado para revisar os PRs dele."}
                                actionLabel={available ? "Revisar PR" : undefined}
                                onAction={available ? () => setRequesting(true) : undefined}
                            />
                        ))}
                    {view === "list" && (
                        <div className="space-y-3">
                            <PrReviewList items={items} available={available} />
                            <div ref={sentinelRef} aria-hidden className="h-px w-full" />
                            {query.isFetchingNextPage && (
                                <div role="status" aria-live="polite" className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando mais revisões…
                                </div>
                            )}
                            {(!supported || query.isFetchNextPageError) && query.hasNextPage && (
                                <div className="flex justify-center">
                                    <Button type="button" variant="outline" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>
                                        Carregar mais ({items.length} de {total})
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>

            <RequestPrReviewDialog open={requesting} onOpenChange={setRequesting} />
        </motion.section>
    )
}
