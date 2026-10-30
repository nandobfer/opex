"use client"

import { useMemo, useState, type ReactNode } from "react"
import Fuse from "fuse.js"
import { AnimatePresence, motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { OptionTabs } from "@/components/ui/option-tabs"
import { RefreshButton } from "@/components/ui/refresh-button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { SearchInput } from "@/components/list/SearchInput"
import { VirtualizedRows } from "@/components/list/VirtualizedRows"
import { apiErrorMessage } from "@/lib/api"
import type { OpencodeResourceKind } from "../constants"
import { matchesStatus, RESOURCE_STATUS_FILTER_LABELS, RESOURCE_STATUS_FILTERS, type ResourceStatusFilter } from "../logic"
import type { OpencodeResourceDto } from "../types"
import { KIND_UI } from "./kind-ui"
import { ResourceRow, type ResourceRowActions } from "./ResourceRow"
import { ScopeSelect } from "./ScopeSelect"

interface OpencodeResourceCardProps {
    kind: OpencodeResourceKind
    scope: string
    onScopeChange: (scope: string) => void
    items: readonly OpencodeResourceDto[] | undefined
    loading: boolean
    error: unknown
    fetching: boolean
    onRefresh: () => void
    actions: ResourceRowActions
    /** Botões do cabeçalho (Novo, Instalar, Atualizar todos). */
    headerActions?: ReactNode
    busyIds?: ReadonlySet<string>
}

/**
 * Esqueleto compartilhado das abas Skills, Agentes, Comandos, Plugins e MCPs: escopo, busca por nome
 * (fuse.js), filtro de situação, lista (virtualizada acima de 50) e os estados carregando/vazio/erro.
 */
export function OpencodeResourceCard({ kind, scope, onScopeChange, items, loading, error, fetching, onRefresh, actions, headerActions, busyIds }: OpencodeResourceCardProps) {
    const ui = KIND_UI[kind]
    const [term, setTerm] = useState("")
    const [status, setStatus] = useState<ResourceStatusFilter>("all")
    const rows = useMemo(() => items ?? [], [items])
    const fuse = useMemo(() => new Fuse(rows, { keys: ["name", "description", "source"], threshold: 0.35, ignoreLocation: true }), [rows])
    const searching = term.trim().length > 0
    const visible = (searching ? fuse.search(term.trim()).map((result) => result.item) : rows).filter((item) => matchesStatus(item, status))
    const filters = RESOURCE_STATUS_FILTERS.filter((value) => value !== "outdated" || ui.hasVersions).map((value) => ({ value, label: RESOURCE_STATUS_FILTER_LABELS[value] }))
    const Icon = ui.icon

    return (
        <Card>
            <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1.5">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Icon className="h-4 w-4 text-primary" aria-hidden />
                        {ui.title}
                        {items ? <span className="font-mono text-xs text-muted-foreground">{items.length}</span> : null}
                    </CardTitle>
                    <CardDescription>{ui.description}</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {headerActions}
                    <RefreshButton onClick={onRefresh} fetching={fetching} />
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                    <ScopeSelect value={scope} onChange={onScopeChange} className="w-full" />
                    <SearchInput value={term} onChange={setTerm} placeholder={`Buscar em ${ui.title.toLowerCase()} pelo nome`} label={`Buscar ${ui.title.toLowerCase()}`} />
                </div>
                <OptionTabs options={filters} value={status} onChange={setStatus} size="sm" />
                {loading ? (
                    <div className="space-y-2" aria-label="Carregando">
                        {[0, 1, 2].map((index) => (
                            <Skeleton key={index} className="h-14 w-full" />
                        ))}
                    </div>
                ) : error ? (
                    <ErrorState title={`Não foi possível listar ${ui.title.toLowerCase()}`} description={apiErrorMessage(error, "Confira se o OpenCode está no ar (aba Controles).")} onRetry={onRefresh} />
                ) : (
                    <div className="rounded-md border" role="list" aria-label={ui.title}>
                        <AnimatePresence initial={false} mode="wait">
                            {visible.length === 0 ? (
                                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                                    <EmptyState
                                        icon={Icon}
                                        title={searching || status !== "all" ? "Nada encontrado" : ui.emptyTitle}
                                        description={searching || status !== "all" ? "Tente outro nome ou filtro." : ui.emptyDescription}
                                        actionLabel={searching || status !== "all" ? "Limpar filtros" : undefined}
                                        onAction={
                                            searching || status !== "all"
                                                ? () => {
                                                      setTerm("")
                                                      setStatus("all")
                                                  }
                                                : undefined
                                        }
                                    />
                                </motion.div>
                            ) : (
                                <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                                    <VirtualizedRows rows={visible} rowKey={(item) => item.id} estimateSize={64} rowClassName="border-b last:border-b-0" renderRow={(item) => <ResourceRow item={item} actions={actions} busy={busyIds?.has(item.id)} />} />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
