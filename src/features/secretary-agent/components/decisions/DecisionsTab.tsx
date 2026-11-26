"use client"

import { useMemo } from "react"
import { ClipboardList } from "lucide-react"
import { InfiniteListView } from "@/components/list/InfiniteListView"
import { VirtualStack } from "@/components/list/VirtualStack"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useUrlFilters } from "@/hooks/useUrlFilters"
import { APP_SCROLL_CONTAINER_ID } from "@/hooks/usePageVirtualizer"
import type { EvolutionContactDto } from "@/features/evolution-api/types"
import { DECISION_FILTER_SCHEMA, DEFAULT_DECISION_FILTERS, hasDecisionFilters, toDecisionListParams } from "../../decision-filters"
import { useSecretaryDecisions } from "../../hooks/useSecretaryDecisions"
import { DecisionRow } from "./DecisionRow"
import { DecisionsFiltersBar } from "./DecisionsFiltersBar"

const scrollRef = { get current() { return typeof document === "undefined" ? null : document.getElementById(APP_SCROLL_CONTAINER_ID) } }

/**
 * Aba Decisões do Agente Secretário (OPE-197): o registro de decisões saiu da aba Critérios, onde crescia sem limite.
 * Filtros na URL (Conversa, Decisão e Período), paginação no servidor, rolagem infinita e virtualização acima de 50.
 */
export function DecisionsTab({ contacts }: { contacts: EvolutionContactDto[] }) {
    const [filters, setFilters, resetFilters] = useUrlFilters(DEFAULT_DECISION_FILTERS, DECISION_FILTER_SCHEMA)
    const params = useMemo(() => toDecisionListParams(filters), [filters])
    const query = useSecretaryDecisions(params)
    const items = query.data?.pages.flatMap((page) => page.items) ?? []
    const total = query.data?.pages[0]?.total ?? 0
    const names = useMemo(() => new Map(contacts.map((contact) => [contact.jid, contact.name])), [contacts])
    return (
        <>
            <DecisionsFiltersBar filters={filters} setFilters={setFilters} onClear={resetFilters} total={total} contacts={contacts} />
            <Card>
                <CardHeader><CardTitle className="text-base">Registro de decisões</CardTitle></CardHeader>
                <CardContent>
                    <InfiniteListView
                        query={query}
                        count={items.length}
                        total={total}
                        filtering={hasDecisionFilters(filters)}
                        onClearFilters={resetFilters}
                        labels={{
                            loading: "Carregando decisões",
                            error: "Não foi possível carregar as decisões",
                            filteredTitle: "Nenhuma decisão com estes filtros",
                            filteredDescription: "Ajuste ou limpe os filtros para ver mais decisões.",
                            loadingMore: "Carregando mais decisões…",
                        }}
                        empty={{ icon: ClipboardList, title: "Nenhuma decisão registrada.", description: "As decisões do Secretário aparecem aqui ao avaliar mensagens.", actionLabel: "Atualizar decisões", onAction: () => void query.refetch() }}
                    >
                        <VirtualStack className="divide-y" count={items.length} scrollRef={scrollRef} estimateSize={56} getKey={(index) => items[index]!._id} renderItem={(index) => <DecisionRow row={items[index]!} name={names.get(items[index]!.jid)} />} />
                    </InfiniteListView>
                </CardContent>
            </Card>
        </>
    )
}
