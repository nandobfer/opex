"use client"

import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Archive, Blocks, LayoutTemplate, Users } from "lucide-react"
import { CadastroHeader } from "@/components/list/CadastroHeader"
import { CadastroSearchPicker, type CadastroSearchPickerOption } from "@/components/list/CadastroSearchPicker"
import { FilterSwitch } from "@/components/list/FilterSwitch"
import { CadastroTableCard } from "@/components/list/CadastroTableCard"
import { FilterGroup } from "@/components/list/FilterGroup"
import { ListFilters } from "@/components/list/ListFilters"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { useUrlFilters } from "@/hooks/useUrlFilters"
import { PLUGIN_SCOPE_LABELS, PLUGIN_SCOPES } from "../constants"
import { slotFilterNodes } from "../slot-tree"
import { DEFAULT_PLUGIN_FILTERS, PLUGIN_FILTER_SCHEMA, filterPlugins, type PluginFilters } from "../filters"
import { usePlugins, usePluginsRealtime } from "../hooks/usePlugins"
import { usePluginSource } from "../client/PluginSourceContext"
import { PluginRow, PluginRowsSkeleton } from "./PluginRow"
import { PluginDebugDialog } from "./debug/PluginDebugDialog"

const SCOPE_OPTIONS: CadastroSearchPickerOption[] = PLUGIN_SCOPES.map((value) => ({ value, label: PLUGIN_SCOPE_LABELS[value] }))
/** Opções do filtro Slot: a árvore (áreas e slots); escolher uma área cobre os slots dela. */
const slotOptions = (nodes: ReturnType<typeof slotFilterNodes>): CadastroSearchPickerOption[] =>
    nodes.map((node) => ({ value: node.id, label: node.label, description: node.description, parent: node.parentId, depth: node.depth, path: node.path }))
const OWNER_SLOT_OPTIONS = slotOptions(slotFilterNodes())
const CLIENT_SLOT_OPTIONS = slotOptions(slotFilterNodes("client"))

/** Lista de plugins (dono: todos; portal: só os do cliente), com filtros na URL e tempo real. */
export function PluginsListView({ title, description, detailHref, emptyDescription }: { title: string; description: string; detailHref: (id: string) => string; emptyDescription: string }) {
    usePluginsRealtime()
    const source = usePluginSource()
    const query = usePlugins()
    const [debugTarget, setDebugTarget] = useState<{ id: string; name: string } | null>(null)
    const [filters, setFilters, resetFilters] = useUrlFilters<PluginFilters>(DEFAULT_PLUGIN_FILTERS, PLUGIN_FILTER_SCHEMA)
    const items = useMemo(() => filterPlugins(query.data ?? [], filters), [query.data, filters])

    return (
        <div className="flex flex-col gap-6">
            <CadastroHeader title={title} description={description} />
            <ListFilters total={items.length} search={{ value: filters.q, onChange: (q) => setFilters((prev) => ({ ...prev, q })), placeholder: "Buscar por nome, id ou cliente", label: "Busca" }} onClear={resetFilters}>
                {source.kind === "owner" && (
                    <FilterGroup label="Escopo" className="min-w-[160px] flex-1">
                        <CadastroSearchPicker icon={Users} aria-label="Escopo" pluralNoun="escopos" searchPlaceholder="Buscar escopo..." options={SCOPE_OPTIONS} selected={filters.scopes} onSelect={(values) => setFilters((prev) => ({ ...prev, scopes: values as PluginFilters["scopes"] }))} />
                    </FilterGroup>
                )}
                <FilterGroup label="Slot" className="min-w-[220px] flex-1">
                    <CadastroSearchPicker icon={LayoutTemplate} aria-label="Slot" pluralNoun="slots" searchPlaceholder="Buscar slot ou área..." options={source.kind === "owner" ? OWNER_SLOT_OPTIONS : CLIENT_SLOT_OPTIONS} selected={filters.slots} onSelect={(values) => setFilters((prev) => ({ ...prev, slots: values }))} />
                </FilterGroup>
                <FilterGroup label="Arquivados" className="shrink-0">
                    <FilterSwitch icon={Archive} text="Mostrar" ariaLabel="Mostrar plugins arquivados" checked={filters.showArchived} onCheckedChange={(showArchived) => setFilters((prev) => ({ ...prev, showArchived }))} />
                </FilterGroup>
            </ListFilters>
            {query.isLoading ? (
                <CadastroTableCard>
                    <PluginRowsSkeleton withDebug={source.kind === "owner"} />
                </CadastroTableCard>
            ) : query.isError ? (
                <ErrorState title="Não foi possível carregar os plugins" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
            ) : !items.length ? (
                <EmptyState icon={Blocks} title={query.data?.length ? "Nenhum plugin com estes filtros" : "Nenhum plugin ainda"} description={query.data?.length ? "Ajuste a busca, o escopo, o slot ou mostre os arquivados." : emptyDescription} />
            ) : (
                <CadastroTableCard>
                    <ul className="divide-y">
                        <AnimatePresence initial={false}>
                            {items.map((plugin) => (
                                <motion.li key={plugin.id} layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                                    <PluginRow plugin={plugin} href={detailHref(plugin.id)} onDebug={source.kind === "owner" ? () => setDebugTarget({ id: plugin.id, name: plugin.name }) : undefined} />
                                </motion.li>
                            ))}
                        </AnimatePresence>
                    </ul>
                </CadastroTableCard>
            )}
            {source.kind === "owner" && <PluginDebugDialog plugin={debugTarget} onOpenChange={(open) => !open && setDebugTarget(null)} />}
        </div>
    )
}
