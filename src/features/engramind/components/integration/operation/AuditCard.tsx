"use client"

import { useState } from "react"
import { ScrollText } from "lucide-react"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/feedback/EmptyState"
import { VirtualizedRows } from "@/components/list/VirtualizedRows"
import { AUDIT_ENTITIES } from "../../../constants"
import { AUDIT_HELP } from "../../../help/operation"
import type { AuditEvent } from "../../../types"
import { useEngramindList } from "../../../hooks/useEngramind"
import { HelpBadge } from "../../shared/Badges"
import { dayToIso, FilterSelect } from "../../shared/FilterSelect"
import { formatDateTime } from "../../shared/format"
import { LoadMore } from "../../shared/LoadMore"
import { QueryBoundary } from "../../shared/QueryBoundary"
import { ListSkeleton } from "../../shared/ListSkeleton"
import { Section } from "../../shared/Section"

/** Auditoria do Engramind com filtros por entidade, id, ação e período (o recorte por data é do Opex). */
export function AuditCard() {
    const [entity, setEntity] = useState<string | undefined>(undefined)
    const [action, setAction] = useState("")
    const [since, setSince] = useState("")
    const [until, setUntil] = useState("")
    const audit = useEngramindList<AuditEvent>("audit", "events", { entity, action: action.trim() || undefined, since: dayToIso(since), until: dayToIso(until, true) })
    const truncated = audit.data?.pages.some((page) => page.truncated) ?? false
    return (
        <Section title="Auditoria" info={`Toda mutação de identidade, token e configuração no Engramind. ${AUDIT_HELP.period}`}>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <FilterSelect id="audit-entity" label="Entidade" value={entity} options={AUDIT_ENTITIES} onChange={setEntity} />
                <Input aria-label="Ação" placeholder="Ação (ex.: token.revoke)" value={action} onChange={(event) => setAction(event.target.value)} className="h-8 bg-transparent text-xs" title={AUDIT_HELP.action} />
                <Input type="date" aria-label="Desde" value={since} onChange={(event) => setSince(event.target.value)} className="h-8 bg-transparent text-xs" />
                <Input type="date" aria-label="Até" value={until} onChange={(event) => setUntil(event.target.value)} className="h-8 bg-transparent text-xs" />
            </div>
            {truncated && <p className="text-xs text-warning">Período longo: mostrando só as páginas mais recentes. Refine os filtros.</p>}
            <QueryBoundary isLoading={audit.isLoading} error={audit.error} onRetry={() => void audit.refetch()} skeleton={<ListSkeleton rows={4} />}>
                {audit.items.length === 0 ? (
                    <EmptyState icon={ScrollText} title="Nenhum evento" description="Nada na auditoria com esses filtros." />
                ) : (
                    <div className="max-h-[28rem] overflow-auto rounded-lg border">
                        <VirtualizedRows
                            rows={audit.items}
                            rowKey={(event) => String(event.id)}
                            estimateSize={44}
                            rowClassName="border-b last:border-b-0"
                            renderRow={(event) => (
                                <div className="flex flex-wrap items-center gap-2 p-2.5 text-xs">
                                    <span className="text-muted-foreground">{formatDateTime(event.at)}</span>
                                    <HelpBadge value={event.action} />
                                    <span className="font-mono">
                                        {event.entity}
                                        {event.entity_id ? `:${event.entity_id}` : ""}
                                    </span>
                                    <span className="ml-auto text-muted-foreground">{[event.app_id, event.agent_id, event.token_id].filter(Boolean).join(" · ")}</span>
                                </div>
                            )}
                        />
                    </div>
                )}
            </QueryBoundary>
            <LoadMore hasNextPage={Boolean(audit.hasNextPage)} isFetchingNextPage={audit.isFetchingNextPage} fetchNextPage={audit.fetchNextPage} />
        </Section>
    )
}
