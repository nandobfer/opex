"use client"

import { useMemo } from "react"
import { ShieldQuestion } from "lucide-react"
import { InfiniteListView } from "@/components/list/InfiniteListView"
import { useUrlFilters } from "@/hooks/useUrlFilters"
import { AgentPage, type AgentPageTab } from "@/features/agent-metrics/components/AgentPage"
import { ADVERSARIAL_REVIEW_FILTER_SCHEMA, DEFAULT_ADVERSARIAL_REVIEW_FILTERS, hasAdversarialReviewFilters, toAdversarialReviewListParams } from "../../filters"
import { useAdversarialRealtime, useAdversarialReviewPages, useAdversarialSettings } from "../../hooks/useAdversarial"
import { AdversarialReviewList } from "../AdversarialReviewList"
import { MemoriesSection } from "../settings/MemoriesSection"
import { AdversarialFiltersBar } from "./AdversarialFiltersBar"

/** Aba "Revisões": rodadas de todas as mesas com os filtros na URL, rolagem infinita e tempo real. */
function ReviewsTab() {
    const [filters, setFilters, resetFilters] = useUrlFilters(DEFAULT_ADVERSARIAL_REVIEW_FILTERS, ADVERSARIAL_REVIEW_FILTER_SCHEMA)
    const params = useMemo(() => toAdversarialReviewListParams(filters), [filters])
    const query = useAdversarialReviewPages(params)
    const pages = query.data?.pages ?? []
    const items = pages.flatMap((page) => page.items)
    const total = pages[0]?.total ?? 0

    return (
        <div className="space-y-4">
            <AdversarialFiltersBar filters={filters} setFilters={setFilters} onClear={resetFilters} total={total} centrals={pages[0]?.centrals ?? []} />
            <InfiniteListView
                query={query}
                count={items.length}
                total={total}
                filtering={hasAdversarialReviewFilters(filters)}
                onClearFilters={resetFilters}
                labels={{
                    loading: "Carregando revisões",
                    error: "Não foi possível carregar as revisões",
                    filteredTitle: "Nenhuma revisão com estes filtros",
                    filteredDescription: "Ajuste ou limpe os filtros para ver mais revisões.",
                    loadingMore: "Carregando mais revisões…",
                }}
                empty={{ icon: ShieldQuestion, title: "Nenhuma revisão ainda", description: "As rodadas aparecem aqui quando uma mesa termina a implementação com o adversário ativo." }}
            >
                <AdversarialReviewList items={items} />
            </InfiniteListView>
        </div>
    )
}

const TABS: AgentPageTab[] = [
    { value: "revisoes", label: "Revisões", render: () => <ReviewsTab /> },
    { value: "memorias", label: "Memórias", render: () => <MemoriesSection /> },
]

/**
 * Agente Adversário (`/agente-adversario`): **Visão geral** (métricas, primeira aba, OPE-122), **Revisões**
 * (rodadas das mesas, mais recentes primeiro, com filtros) e **Memórias** (lista `adversarial`). A aba
 * fica na URL (`?aba=memorias`). A configuração fica em Integrações › Inteligência Artificial › Adversário.
 */
export function AdversarialReviewsPage() {
    useAdversarialRealtime()
    const settings = useAdversarialSettings()
    const availability = settings.data?.availability
    return <AgentPage agent="adversario" tabs={TABS} availabilityReason={availability && !availability.available ? availability.reason : null} />
}
