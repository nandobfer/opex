"use client"

import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Blocks } from "lucide-react"
import { CadastroHeader } from "@/components/list/CadastroHeader"
import { CadastroMultiSelect } from "@/components/list/CadastroMultiSelect"
import { CadastroTableCard } from "@/components/list/CadastroTableCard"
import { FilterGroup } from "@/components/list/FilterGroup"
import { ListFilters } from "@/components/list/ListFilters"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { useUrlFilters } from "@/hooks/useUrlFilters"
import { CLIENT_PLUGIN_SLOTS, PLUGIN_SCOPE_LABELS, PLUGIN_SCOPES, PLUGIN_SLOT_LABELS, PLUGIN_SLOTS } from "../constants"
import { DEFAULT_PLUGIN_FILTERS, PLUGIN_FILTER_SCHEMA, filterPlugins, type PluginFilters } from "../filters"
import { usePlugins, usePluginsRealtime } from "../hooks/usePlugins"
import { usePluginSource } from "../client/PluginSourceContext"
import { PluginRow, PluginRowsSkeleton } from "./PluginRow"
import { PluginDebugDialog } from "./debug/PluginDebugDialog"

const SCOPE_OPTIONS = PLUGIN_SCOPES.map((value) => ({ value, label: PLUGIN_SCOPE_LABELS[value] }))
const slotOptions = (slots: readonly (keyof typeof PLUGIN_SLOT_LABELS)[]) => slots.map((value) => ({ value, label: PLUGIN_SLOT_LABELS[value] }))
const OWNER_SLOT_OPTIONS = slotOptions(PLUGIN_SLOTS)
const CLIENT_SLOT_OPTIONS = slotOptions(CLIENT_PLUGIN_SLOTS)

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
                        <CadastroMultiSelect aria-label="Escopo" placeholder="Todos" options={SCOPE_OPTIONS} selected={filters.scopes} onSelect={(values) => setFilters((prev) => ({ ...prev, scopes: values as PluginFilters["scopes"] }))} />
                    </FilterGroup>
                )}
                <FilterGroup label="Slot" className="min-w-[200px] flex-1">
                    <CadastroMultiSelect aria-label="Slot" placeholder="Todos" options={source.kind === "owner" ? OWNER_SLOT_OPTIONS : CLIENT_SLOT_OPTIONS} selected={filters.slots} onSelect={(values) => setFilters((prev) => ({ ...prev, slots: values as PluginFilters["slots"] }))} />
                </FilterGroup>
            </ListFilters>
            {query.isLoading ? (
                <CadastroTableCard>
                    <PluginRowsSkeleton withDebug={source.kind === "owner"} />
                </CadastroTableCard>
            ) : query.isError ? (
                <ErrorState title="Não foi possível carregar os plugins" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
            ) : !items.length ? (
                <EmptyState icon={Blocks} title={query.data?.length ? "Nenhum plugin com estes filtros" : "Nenhum plugin ainda"} description={query.data?.length ? "Ajuste a busca, o escopo ou o slot." : emptyDescription} />
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
