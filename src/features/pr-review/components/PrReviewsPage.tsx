"use client"

import { useMemo, useState } from "react"
import { FolderGit2, GitPullRequest, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { InfiniteListView } from "@/components/list/InfiniteListView"
import { useUrlFilters } from "@/hooks/useUrlFilters"
import { AgentPage, type AgentPageTab } from "@/features/agent-metrics/components/AgentPage"
import { DEFAULT_PR_REVIEW_FILTERS, hasPrReviewFilters, PR_REVIEW_FILTER_SCHEMA, toPrReviewListParams } from "../filters"
import { usePrReviewPages, usePrReviewRealtime, usePrReviewSettings } from "../hooks/usePrReview"
import { PrReviewFiltersBar } from "./PrReviewFiltersBar"
import { PrReviewList } from "./PrReviewList"
import { RequestPrReviewDialog } from "./RequestPrReviewDialog"

/** Aba **Revisões**: repositórios acompanhados, filtros na URL, rolagem infinita e as ações das revisões. */
function ReviewsTab({ available, onRequest }: { available: boolean; onRequest: () => void }) {
    const [filters, setFilters, resetFilters] = useUrlFilters(DEFAULT_PR_REVIEW_FILTERS, PR_REVIEW_FILTER_SCHEMA)
    const params = useMemo(() => toPrReviewListParams(filters), [filters])
    const query = usePrReviewPages(params)
    const pages = query.data?.pages ?? []
    const items = pages.flatMap((page) => page.items)
    const first = pages[0]
    const repos = first?.repos ?? []
    const total = first?.total ?? 0

    return (
        <div className="space-y-4">
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

            <InfiniteListView
                query={query}
                count={items.length}
                total={total}
                filtering={hasPrReviewFilters(filters)}
                onClearFilters={resetFilters}
                labels={{
                    loading: "Carregando revisões",
                    error: "Não foi possível carregar as revisões",
                    filteredTitle: "Nenhuma revisão com estes filtros",
                    filteredDescription: "Ajuste ou limpe os filtros para ver mais revisões.",
                    loadingMore: "Carregando mais revisões…",
                }}
                empty={{
                    icon: GitPullRequest,
                    title: "Nenhuma revisão ainda",
                    description: repos.length ? "As revisões aparecem aqui quando a rotina de PRs encontrar PRs que atendem ao critério." : "Crie uma central de desenvolvimento com repositório vinculado para revisar os PRs dele.",
                    actionLabel: available ? "Revisar PR" : undefined,
                    onAction: available ? onRequest : undefined,
                }}
            >
                <PrReviewList items={items} available={available} />
            </InfiniteListView>
        </div>
    )
}

/**
 * Agente Revisor (`/agente-revisor`): **Visão geral** (métricas, primeira aba, OPE-122) e **Revisões**
 * (PRs das centrais, mais recentes primeiro, filtros na URL, rolagem infinita e tempo real; ações Ver,
 * Revisar de novo, Parar e Revisar PR). A configuração fica em Integrações › Inteligência Artificial › Revisor.
 */
export function PrReviewsPage() {
    usePrReviewRealtime()
    const settings = usePrReviewSettings()
    const [requesting, setRequesting] = useState(false)
    const availability = settings.data?.availability
    const available = availability?.available === true
    const tabs = useMemo<AgentPageTab[]>(() => [{ value: "revisoes", label: "Revisões", render: () => <ReviewsTab available={available} onRequest={() => setRequesting(true)} /> }], [available])

    return (
        <>
            <AgentPage
                agent="revisor"
                tabs={tabs}
                availabilityReason={available ? null : (availability?.reason ?? null)}
                actions={
                    <Button type="button" size="sm" className="h-9 gap-1.5" disabled={!available} onClick={() => setRequesting(true)}>
                        <Plus className="h-4 w-4" aria-hidden /> Revisar PR
                    </Button>
                }
            />
            <RequestPrReviewDialog open={requesting} onOpenChange={setRequesting} />
        </>
    )
}
