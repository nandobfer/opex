"use client"

import { useMemo, useState, type ReactNode } from "react"
import Fuse from "fuse.js"
import { AnimatePresence, motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { OptionTabs } from "@/components/ui/option-tabs"
import { RefreshButton } from "@/components/ui/refresh-button"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { SearchInput } from "@/components/list/SearchInput"
import { VirtualizedRows } from "@/components/list/VirtualizedRows"
import { apiErrorMessage } from "@/lib/api"
import { ResourceListSkeleton } from "./ResourceListSkeleton"

export interface ResourceListFilter<F extends string> {
    value: F
    label: string
}

interface ResourceListCardProps<T, F extends string> {
    title: string
    description: ReactNode
    icon: LucideIcon
    items: readonly T[] | undefined
    loading: boolean
    error: unknown
    /** Mensagem do erro quando a API não traz uma. */
    errorHint: string
    fetching: boolean
    onRefresh: () => void
    rowKey: (item: T) => string
    renderRow: (item: T) => ReactNode
    /** Campos do fuse.js na busca por nome. */
    searchKeys: string[]
    filters: readonly ResourceListFilter<F>[]
    matches: (item: T, filter: F) => boolean
    emptyTitle: string
    emptyDescription: string
    /** Ações do estado vazio (ex.: Criar / Instalar), quando não há busca nem filtro. */
    emptyActions?: ReactNode
    /** Botões do cabeçalho (Novo, Instalar, Atualizar todos). */
    headerActions?: ReactNode
    /** Campo ao lado da busca (ex.: escopo); sem ele, a busca ocupa a linha. */
    toolbar?: ReactNode
}

/**
 * Lista de recursos em card (OPE-153, extraída da aba Skills do OpenCode): cabeçalho com contador e ações,
 * busca por nome (fuse.js), filtro de situação, lista (virtualizada acima de 50) e os estados
 * carregando/vazio/erro. Usada pelas abas de recursos do OpenCode e pelas Skills do Agente Opex.
 */
export function ResourceListCard<T, F extends string>(props: ResourceListCardProps<T, F>) {
    const { title, description, icon: Icon, items, loading, error, errorHint, fetching, onRefresh, rowKey, renderRow, searchKeys, filters, matches, emptyTitle, emptyDescription, emptyActions, headerActions, toolbar } = props
    const [term, setTerm] = useState("")
    const [filter, setFilter] = useState<F>(filters[0]!.value)
    const rows = useMemo(() => items ?? [], [items])
    const fuse = useMemo(() => new Fuse(rows, { keys: searchKeys, threshold: 0.35, ignoreLocation: true }), [rows, searchKeys])
    const searching = term.trim().length > 0
    const filtered = searching || filter !== filters[0]!.value
    const visible = (searching ? fuse.search(term.trim()).map((result) => result.item) : rows).filter((item) => matches(item, filter))
    const search = <SearchInput value={term} onChange={setTerm} placeholder={`Buscar em ${title.toLowerCase()} pelo nome`} label={`Buscar ${title.toLowerCase()}`} />

    return (
        <Card>
            <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1.5">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Icon className="h-4 w-4 text-primary" aria-hidden />
                        {title}
                        {items ? <span className="font-mono text-xs text-muted-foreground">{items.length}</span> : null}
                    </CardTitle>
                    <CardDescription>{description}</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {headerActions}
                    <RefreshButton onClick={onRefresh} fetching={fetching} />
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {toolbar ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                        {toolbar}
                        {search}
                    </div>
                ) : (
                    search
                )}
                <OptionTabs options={[...filters]} value={filter} onChange={setFilter} size="sm" />
                {loading ? (
                    <ResourceListSkeleton />
                ) : error ? (
                    <ErrorState title={`Não foi possível listar ${title.toLowerCase()}`} description={apiErrorMessage(error, errorHint)} onRetry={onRefresh} />
                ) : (
                    <div className="rounded-md border" role="list" aria-label={title}>
                        <AnimatePresence initial={false} mode="wait">
                            {visible.length === 0 ? (
                                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                                    <EmptyState
                                        icon={Icon}
                                        title={filtered ? "Nada encontrado" : emptyTitle}
                                        description={filtered ? "Tente outro nome ou filtro." : emptyDescription}
                                        actionLabel={filtered ? "Limpar filtros" : undefined}
                                        onAction={
                                            filtered
                                                ? () => {
                                                      setTerm("")
                                                      setFilter(filters[0]!.value)
                                                  }
                                                : undefined
                                        }
                                    >
                                        {!filtered && emptyActions ? <div className="flex flex-wrap justify-center gap-2">{emptyActions}</div> : null}
                                    </EmptyState>
                                </motion.div>
                            ) : (
                                <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                                    <VirtualizedRows rows={visible} rowKey={rowKey} estimateSize={64} rowClassName="border-b last:border-b-0" renderRow={renderRow} />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
