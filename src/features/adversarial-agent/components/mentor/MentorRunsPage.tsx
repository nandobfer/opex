"use client"

import { useMemo } from "react"
import { GraduationCap } from "lucide-react"
import { InfiniteListView } from "@/components/list/InfiniteListView"
import { useUrlFilters } from "@/hooks/useUrlFilters"
import { AgentPage, type AgentPageTab } from "@/features/agent-metrics/components/AgentPage"
import { DEFAULT_MENTOR_RUN_FILTERS, hasMentorRunFilters, MENTOR_RUN_FILTER_SCHEMA, toMentorRunListParams } from "../../mentor/filters"
import { useMentorRealtime, useMentorRunPages, useMentorSettings } from "../../hooks/useMentor"
import { MentorFiltersBar } from "./MentorFiltersBar"
import { MentorRunList } from "./MentorRunList"

/** Aba **Execuções**: execuções do Mentor com os filtros na URL (recorte feito pela API), rolagem infinita. */
function RunsTab() {
    const [filters, setFilters, resetFilters] = useUrlFilters(DEFAULT_MENTOR_RUN_FILTERS, MENTOR_RUN_FILTER_SCHEMA)
    const params = useMemo(() => toMentorRunListParams(filters), [filters])
    const query = useMentorRunPages(params)
    const pages = query.data?.pages ?? []
    const items = pages.flatMap((page) => page.items)
    const total = pages[0]?.total ?? 0
    return (
        <div className="space-y-4">
            <MentorFiltersBar filters={filters} setFilters={setFilters} onClear={resetFilters} total={total} centrals={pages[0]?.centrals ?? []} />
            <InfiniteListView
                query={query}
                count={items.length}
                total={total}
                filtering={hasMentorRunFilters(filters)}
                onClearFilters={resetFilters}
                labels={{
                    loading: "Carregando execuções",
                    error: "Não foi possível carregar as execuções",
                    filteredTitle: "Nenhuma execução com estes filtros",
                    filteredDescription: "Ajuste ou limpe os filtros para ver mais execuções.",
                    loadingMore: "Carregando mais execuções…",
                }}
                empty={{ icon: GraduationCap, title: "Nenhuma execução ainda", description: "As avaliações aparecem aqui quando um turno da mesa dispara o Mentor (ex.: uma correção pedida por você)." }}
            >
                <MentorRunList items={items} />
            </InfiniteListView>
        </div>
    )
}

const TABS: AgentPageTab[] = [{ value: "execucoes", label: "Execuções", render: () => <RunsTab /> }]

/**
 * Agente Mentor (`/agente-mentor`): **Visão geral** (métricas, primeira aba, OPE-122) e **Execuções**
 * (mais recentes primeiro; "Decidir" abre a sugestão para aprovar ou descartar). Tempo real. A
 * configuração fica em Integrações › Inteligência Artificial › Mentor.
 */
export function MentorRunsPage() {
    useMentorRealtime()
    const settings = useMentorSettings()
    const availability = settings.data?.availability
    return <AgentPage agent="mentor" tabs={TABS} availabilityReason={availability && !availability.available ? availability.reason : null} />
}
