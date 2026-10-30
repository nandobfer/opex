"use client"

import type { ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { FilterX, Loader2, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll"
import { apiErrorMessage } from "@/lib/api"

/** O que a lista usa de um `useInfiniteQuery`. */
export interface InfiniteListQuery {
    isLoading: boolean
    isError: boolean
    error: unknown
    refetch: () => unknown
    hasNextPage: boolean
    isFetchingNextPage: boolean
    isFetchNextPageError: boolean
    fetchNextPage: () => unknown
}

interface InfiniteListViewProps {
    query: InfiniteListQuery
    /** Itens já carregados e total no recorte ("Carregar mais (x de y)"). */
    count: number
    total: number
    /** Há filtro aplicado: o vazio oferece "Limpar filtros". */
    filtering: boolean
    onClearFilters: () => void
    labels: {
        /** Nome acessível do skeleton (ex.: "Carregando revisões"). */
        loading: string
        /** Título do erro (ex.: "Não foi possível carregar as revisões"). */
        error: string
        /** Vazio com filtro (ex.: "Nenhuma revisão com estes filtros"). */
        filteredTitle: string
        filteredDescription: string
        /** Rodapé enquanto carrega a próxima página (ex.: "Carregando mais revisões…"). */
        loadingMore: string
    }
    /** Vazio sem filtro. */
    empty: { icon: LucideIcon; title: string; description: string; actionLabel?: string; onAction?: () => void }
    /** A lista (renderizada quando há itens). */
    children: ReactNode
}

const swap = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.2 } }

/**
 * Corpo das listas paginadas por filtro (páginas dos agentes): skeleton, erro com tentar novamente,
 * vazio com e sem filtro e a lista com rolagem infinita (sentinela) e "Carregar mais" de reserva.
 */
export function InfiniteListView({ query, count, total, filtering, onClearFilters, labels, empty, children }: InfiniteListViewProps) {
    const { sentinelRef, supported } = useInfiniteScroll({
        onLoadMore: () => void query.fetchNextPage(),
        disabled: !query.hasNextPage || query.isFetchingNextPage || query.isFetchNextPageError,
    })
    const view = query.isLoading ? "loading" : query.isError ? "error" : count === 0 ? "empty" : "list"

    return (
        <AnimatePresence mode="wait" initial={false}>
            <motion.div key={view} {...swap}>
                {view === "loading" && (
                    <div className="space-y-2" aria-label={labels.loading}>
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-20 w-full" />
                    </div>
                )}
                {view === "error" && <ErrorState title={labels.error} description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />}
                {view === "empty" &&
                    (filtering ? (
                        <EmptyState icon={FilterX} title={labels.filteredTitle} description={labels.filteredDescription} actionLabel="Limpar filtros" onAction={onClearFilters} />
                    ) : (
                        <EmptyState icon={empty.icon} title={empty.title} description={empty.description} actionLabel={empty.actionLabel} onAction={empty.onAction} />
                    ))}
                {view === "list" && (
                    <div className="space-y-3">
                        {children}
                        <div ref={sentinelRef} aria-hidden className="h-px w-full" />
                        {query.isFetchingNextPage && (
                            <div role="status" aria-live="polite" className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {labels.loadingMore}
                            </div>
                        )}
                        {(!supported || query.isFetchNextPageError) && query.hasNextPage && (
                            <div className="flex justify-center">
                                <Button type="button" variant="outline" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>
                                    Carregar mais ({count} de {total})
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </motion.div>
        </AnimatePresence>
    )
}
