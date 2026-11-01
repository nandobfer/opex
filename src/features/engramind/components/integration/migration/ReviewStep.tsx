"use client"

import { useMemo } from "react"
import { Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useMemoriesMeta } from "@/features/ai/hooks/useMemories"
import { useMigrationBulk, useMigrationReview } from "../../../hooks/useMemoryMigration"
import type { MemoryMigrationDto, MigrationItemDto } from "../../../types"
import { Section } from "../../shared/Section"
import { ReviewItem } from "./ReviewItem"

interface ListGroup {
    key: string
    list: string
    centralId: string | null
    title: string
    items: MigrationItemDto[]
}

function groupsOf(items: readonly MigrationItemDto[]): ListGroup[] {
    const groups = new Map<string, ListGroup>()
    for (const item of items) {
        if (!item.decision) continue
        const key = `${item.list}|${item.centralId ?? ""}`
        const group = groups.get(key) ?? { key, list: item.list, centralId: item.centralId, title: item.listTitle, items: [] }
        group.items.push(item)
        groups.set(key, group)
    }
    return [...groups.values()]
}

/**
 * Etapa 3: revisão do dono, por lista. "Aprovar/Rejeitar lista" decide só as que o curador mandou
 * migrar; as `descartar`/`revisar_dono` pedem ação explícita (uma a uma, ou o lote "incluindo as que
 * pedem atenção"). Nada é importado sem aprovação.
 */
export function ReviewStep({ state }: { state: MemoryMigrationDto }) {
    const review = useMigrationReview()
    const bulk = useMigrationBulk()
    const meta = useMemoriesMeta()
    const groups = useMemo(() => groupsOf(state.items), [state.items])
    const busy = state.steps.triage.status === "running" || state.steps.compact.status === "running" || state.steps.import.status === "running"
    const categories = meta.data?.categories ?? []
    const textMax = meta.data?.textMax ?? 4000
    return (
        <Section title="3. Revisão do dono" info="Original e proposta lado a lado. Toda decisão descartar ou revisar (dono) exige uma ação sua; nada é importado sem aprovação.">
            {groups.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Rode o curador para revisar as decisões.</p>
            ) : (
                groups.map((group) => {
                    const attention = group.items.filter((item) => item.needsAttention && item.review.status === "pendente" && !item.imported).length
                    const decide = (status: "aprovada" | "rejeitada", includeAttention = false) => bulk.mutate({ list: group.list, centralId: group.centralId, status, includeAttention })
                    return (
                        <div key={group.key} className="space-y-2" data-testid="migration-review-list">
                            <div className="flex flex-wrap items-center gap-2">
                                <h4 className="min-w-0 flex-1 text-sm font-semibold">
                                    {group.title}
                                    {group.centralId && <span className="ml-1 font-mono text-xs text-muted-foreground">{group.centralId.slice(-6)}</span>}
                                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                                        {group.items.length} memória(s){attention ? ` · ${attention} pedem sua atenção` : ""}
                                    </span>
                                </h4>
                                <Button type="button" size="sm" variant="outline" disabled={busy || bulk.isPending} onClick={() => decide("rejeitada")}>
                                    <X className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Rejeitar lista
                                </Button>
                                <Button type="button" size="sm" disabled={busy || bulk.isPending} onClick={() => decide("aprovada")}>
                                    <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Aprovar lista
                                </Button>
                                {attention > 0 && (
                                    <Button type="button" size="sm" variant="ghost" disabled={busy || bulk.isPending} onClick={() => decide("aprovada", true)}>
                                        Aprovar incluindo as que pedem atenção
                                    </Button>
                                )}
                            </div>
                            <ul className="divide-y rounded-lg border">
                                {group.items.map((item) => (
                                    <ReviewItem key={item.id} item={item} categories={categories} textMax={textMax} disabled={busy} onDecide={(patch) => review.mutate({ items: [{ id: item.id, ...patch }] })} />
                                ))}
                            </ul>
                        </div>
                    )
                })
            )}
        </Section>
    )
}
