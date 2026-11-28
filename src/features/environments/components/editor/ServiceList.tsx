"use client"

import type { KeyboardEvent } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Badge } from "@/components/ui/badge"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { SearchPicker } from "@/components/ui/search-picker"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { SERVICE_LIST_ROW } from "../../environment-editor-layout"
import type { ServiceListItem } from "../../services-form"

/** Selos de um serviço da lista (build/imagem, imagem própria, ajustes, fora do ambiente, fora do compose). */
function ServiceBadges({ item }: { item: ServiceListItem }) {
    return (
        <span className="flex flex-wrap gap-1">
            {item.ownImage ? (
                <Badge variant="outline">imagem própria</Badge>
            ) : item.hasBuild ? (
                <Badge variant="outline">build</Badge>
            ) : item.compose?.image ? (
                <Badge variant="outline" className="max-w-full truncate font-mono">
                    {item.compose.image}
                </Badge>
            ) : null}
            {item.customized > 0 && <Badge variant="secondary">{item.customized === 1 ? "1 ajuste" : `${item.customized} ajustes`}</Badge>}
            {item.outside && (
                <Badge variant="outline" className="text-muted-foreground">
                    fora do ambiente
                </Badge>
            )}
            {item.orphan && (
                <Badge variant="outline" className="border-warning/50 text-warning">
                    não está no compose
                </Badge>
            )}
        </span>
    )
}

/** Linhas de carregamento com a altura de uma linha de serviço. */
export function ServiceListSkeleton() {
    return (
        <div className="space-y-1" aria-label="Lendo o compose">
            {[0, 1, 2].map((row) => (
                <div key={row} className={SERVICE_LIST_ROW}>
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-16" />
                </div>
            ))}
        </div>
    )
}

/**
 * Serviços do compose (lista à esquerda, no `lg`): escolha por clique ou ↑/↓. Abaixo do `lg`, vira um
 * seletor com busca acima do painel.
 */
export function ServiceList({ items, selected, onSelect }: { items: ServiceListItem[]; selected: string | null; onSelect: (name: string) => void }) {
    const reduced = useReducedMotion()
    const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
        event.preventDefault()
        const index = items.findIndex((item) => item.name === selected)
        const next = items[Math.min(items.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))]
        if (next) {
            onSelect(next.name)
            requestAnimationFrame(() => document.getElementById(`service-option-${next.name}`)?.focus())
        }
    }
    const current = items.find((item) => item.name === selected)
    return (
        <>
            <div className="lg:hidden">
                <SearchPicker
                    trigger={<FieldTrigger aria-label="Serviço" placeholder="Escolha o serviço" value={current ? <span className="font-mono">Serviço: {current.name}</span> : undefined} />}
                    items={items}
                    getKey={(item) => item.name}
                    renderItem={(item) => (
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                            <span className="font-mono text-sm">{item.name}</span>
                            <ServiceBadges item={item} />
                        </span>
                    )}
                    onPick={(item) => onSelect(item.name)}
                    filterItems={(list, term) => list.filter((item) => item.name.toLowerCase().includes(term.toLowerCase()))}
                    matchTriggerWidth
                    searchLabel="Buscar serviço"
                    listLabel="Serviços do compose"
                    emptyText="Nenhum serviço"
                    emptySearchText="Nenhum serviço encontrado"
                />
            </div>
            <ul role="listbox" aria-label="Serviços do compose" className="hidden space-y-1 lg:block" onKeyDown={onKeyDown}>
                {items.map((item) => {
                    const active = item.name === selected
                    return (
                        <li key={item.name} role="presentation">
                            <button
                                type="button"
                                role="option"
                                id={`service-option-${item.name}`}
                                aria-selected={active}
                                tabIndex={active || (!selected && item === items[0]) ? 0 : -1}
                                onClick={() => onSelect(item.name)}
                                className={cn(SERVICE_LIST_ROW, "relative transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
                            >
                                {active && <motion.span layoutId="service-list-active" className="absolute inset-0 rounded-lg bg-muted" transition={{ duration: reduced ? 0 : 0.2 }} aria-hidden />}
                                <span className="relative font-mono text-sm">{item.name}</span>
                                <span className="relative w-full">
                                    <ServiceBadges item={item} />
                                </span>
                            </button>
                        </li>
                    )
                })}
            </ul>
        </>
    )
}
