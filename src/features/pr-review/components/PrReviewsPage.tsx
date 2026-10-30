"use client"

import { useMemo, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { FolderGit2, GitPullRequest, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AvailabilityNotice } from "@/components/feedback/AvailabilityNotice"
import { AgentPageHeader } from "@/components/list/AgentPageHeader"
import { InfiniteListView } from "@/components/list/InfiniteListView"
import { useUrlFilters } from "@/hooks/useUrlFilters"
import { PR_REVIEW_SETTINGS_HREF } from "../constants"
import { DEFAULT_PR_REVIEW_FILTERS, hasPrReviewFilters, PR_REVIEW_FILTER_SCHEMA, toPrReviewListParams } from "../filters"
import { usePrReviewPages, usePrReviewRealtime, usePrReviewSettings } from "../hooks/usePrReview"
import { PrReviewFiltersBar } from "./PrReviewFiltersBar"
import { PrReviewList } from "./PrReviewList"
import { RequestPrReviewDialog } from "./RequestPrReviewDialog"

/**
 * Agente Revisor (`/agente-revisor`): revisões dos PRs das centrais, mais recentes primeiro, com os
 * filtros na URL (recorte feito pela API), rolagem infinita e tempo real. Ações: Ver, Revisar de
 * novo, Parar e Revisar PR. A configuração fica em Integrações › Inteligência Artificial › Agente Revisor.
 */
export function PrReviewsPage() {
    const reduceMotion = useReducedMotion()
    usePrReviewRealtime()
    const [filters, setFilters, resetFilters] = useUrlFilters(DEFAULT_PR_REVIEW_FILTERS, PR_REVIEW_FILTER_SCHEMA)
    const params = useMemo(() => toPrReviewListParams(filters), [filters])
    const query = usePrReviewPages(params)
    const settings = usePrReviewSettings()
    const [requesting, setRequesting] = useState(false)

    const pages = query.data?.pages ?? []
    const items = pages.flatMap((page) => page.items)
    const first = pages[0]
    const repos = first?.repos ?? []
    const total = first?.total ?? 0
    const availability = settings.data?.availability
    const available = availability?.available === true

    return (
        <motion.section initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
            <AgentPageHeader icon={GitPullRequest} title="Agente Revisor" description="Revisões dos PRs das centrais. Atualiza em tempo real." settingsHref={PR_REVIEW_SETTINGS_HREF}>
                <Button type="button" size="sm" className="h-9 gap-1.5" disabled={!available} onClick={() => setRequesting(true)}>
                    <Plus className="h-4 w-4" aria-hidden /> Revisar PR
                </Button>
            </AgentPageHeader>

            <AvailabilityNotice reason={available ? null : availability?.reason} />

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
                    onAction: available ? () => setRequesting(true) : undefined,
                }}
            >
                <PrReviewList items={items} available={available} />
            </InfiniteListView>

            <RequestPrReviewDialog open={requesting} onOpenChange={setRequesting} />
        </motion.section>
    )
}
