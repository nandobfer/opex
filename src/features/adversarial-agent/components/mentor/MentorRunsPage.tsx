"use client"

import { useMemo } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { GraduationCap } from "lucide-react"
import { AvailabilityNotice } from "@/components/feedback/AvailabilityNotice"
import { AgentPageHeader } from "@/components/list/AgentPageHeader"
import { InfiniteListView } from "@/components/list/InfiniteListView"
import { useUrlFilters } from "@/hooks/useUrlFilters"
import { MENTOR_SETTINGS_HREF } from "../../mentor/constants"
import { DEFAULT_MENTOR_RUN_FILTERS, hasMentorRunFilters, MENTOR_RUN_FILTER_SCHEMA, toMentorRunListParams } from "../../mentor/filters"
import { useMentorRealtime, useMentorRunPages, useMentorSettings } from "../../hooks/useMentor"
import { MentorFiltersBar } from "./MentorFiltersBar"
import { MentorRunList } from "./MentorRunList"

/**
 * Agente Mentor (`/agente-mentor`): execuções do Mentor, mais recentes primeiro, com os filtros na
 * URL (recorte feito pela API), rolagem infinita e tempo real. "Decidir" abre a sugestão para
 * aprovar ou descartar. A configuração fica em Integrações › Inteligência Artificial › Agente Mentor.
 */
export function MentorRunsPage() {
    const reduceMotion = useReducedMotion()
    useMentorRealtime()
    const settings = useMentorSettings()
    const [filters, setFilters, resetFilters] = useUrlFilters(DEFAULT_MENTOR_RUN_FILTERS, MENTOR_RUN_FILTER_SCHEMA)
    const params = useMemo(() => toMentorRunListParams(filters), [filters])
    const query = useMentorRunPages(params)
    const pages = query.data?.pages ?? []
    const items = pages.flatMap((page) => page.items)
    const total = pages[0]?.total ?? 0
    const availability = settings.data?.availability

    return (
        <motion.section initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
            <AgentPageHeader icon={GraduationCap} title="Agente Mentor" description="Avaliações dos turnos das mesas que viram memórias do Agente Adversário. Atualiza em tempo real." settingsHref={MENTOR_SETTINGS_HREF} />
            <AvailabilityNotice reason={availability && !availability.available ? availability.reason : null} />
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
        </motion.section>
    )
}
