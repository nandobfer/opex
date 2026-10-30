"use client"

import { useMemo } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ShieldQuestion, Swords } from "lucide-react"
import { OptionTabs } from "@/components/ui/option-tabs"
import { AvailabilityNotice } from "@/components/feedback/AvailabilityNotice"
import { AgentPageHeader } from "@/components/list/AgentPageHeader"
import { InfiniteListView } from "@/components/list/InfiniteListView"
import { urlFilterCodecs, useUrlFilters, type UrlFilterSchema } from "@/hooks/useUrlFilters"
import { ADVERSARIAL_SETTINGS_HREF } from "../../constants"
import { ADVERSARIAL_REVIEW_FILTER_SCHEMA, DEFAULT_ADVERSARIAL_REVIEW_FILTERS, hasAdversarialReviewFilters, toAdversarialReviewListParams } from "../../filters"
import { useAdversarialRealtime, useAdversarialReviewPages, useAdversarialSettings } from "../../hooks/useAdversarial"
import { AdversarialReviewList } from "../AdversarialReviewList"
import { MemoriesSection } from "../settings/MemoriesSection"
import { AdversarialFiltersBar } from "./AdversarialFiltersBar"

const TABS = ["revisoes", "memorias"] as const
type Tab = (typeof TABS)[number]
const TAB_OPTIONS: { value: Tab; label: string }[] = [
    { value: "revisoes", label: "Revisões" },
    { value: "memorias", label: "Memórias" },
]
const TAB_DEFAULTS = { aba: "revisoes" as Tab }
const TAB_SCHEMA: UrlFilterSchema<{ aba: Tab }> = { aba: urlFilterCodecs.string<Tab>(TABS) }
const tabMotion = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 }, transition: { duration: 0.18 } }

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

/**
 * Agente Adversário (`/agente-adversario`): aba **Revisões** (rodadas das mesas, mais recentes
 * primeiro, com filtros) e aba **Memórias** (lista `adversarial`). A aba fica na URL (`?aba=memorias`).
 * A configuração fica em Integrações › Inteligência Artificial › Agente Adversário.
 */
export function AdversarialReviewsPage() {
    const reduceMotion = useReducedMotion()
    useAdversarialRealtime()
    const settings = useAdversarialSettings()
    const [{ aba }, setTab] = useUrlFilters(TAB_DEFAULTS, TAB_SCHEMA)
    const availability = settings.data?.availability

    return (
        <motion.section initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
            <AgentPageHeader icon={Swords} title="Agente Adversário" description="Revisões do código das mesas antes da prévia ou do PR, e as memórias do agente. Atualiza em tempo real." settingsHref={ADVERSARIAL_SETTINGS_HREF} />
            <AvailabilityNotice reason={availability && !availability.available ? availability.reason : null} />
            <OptionTabs<Tab> id="adversarial-page-tab" options={TAB_OPTIONS} value={aba} onChange={(value) => setTab({ aba: value })} className="w-full" />
            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={aba} {...tabMotion}>
                    {aba === "revisoes" ? <ReviewsTab /> : <MemoriesSection />}
                </motion.div>
            </AnimatePresence>
        </motion.section>
    )
}
