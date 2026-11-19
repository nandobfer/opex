"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { Blocks } from "lucide-react"
import { CadastroHeader } from "@/components/list/CadastroHeader"
import { CadastroMultiSelect } from "@/components/list/CadastroMultiSelect"
import { CadastroTableCard } from "@/components/list/CadastroTableCard"
import { CadastroTableSkeleton } from "@/components/list/CadastroTableSkeleton"
import { FilterGroup } from "@/components/list/FilterGroup"
import { ListFilters } from "@/components/list/ListFilters"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { useUrlFilters } from "@/hooks/useUrlFilters"
import { PLUGIN_SCOPE_LABELS, PLUGIN_SCOPES } from "../constants"
import { DEFAULT_PLUGIN_FILTERS, PLUGIN_FILTER_SCHEMA, filterPlugins, type PluginFilters } from "../filters"
import { usePlugins, usePluginsRealtime } from "../hooks/usePlugins"
import { usePluginSource } from "../client/PluginSourceContext"
import { PluginRow } from "./PluginRow"

const SCOPE_OPTIONS = PLUGIN_SCOPES.map((value) => ({ value, label: PLUGIN_SCOPE_LABELS[value] }))

/** Lista de plugins (dono: todos; portal: só os do cliente), com filtros na URL e tempo real. */
export function PluginsListView({ title, description, detailHref, emptyDescription }: { title: string; description: string; detailHref: (id: string) => string; emptyDescription: string }) {
    usePluginsRealtime()
    const source = usePluginSource()
    const router = useRouter()
    const query = usePlugins()
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
            </ListFilters>
            {query.isLoading ? (
                <CadastroTableCard>
                    <CadastroTableSkeleton columns={4} rows={4} />
                </CadastroTableCard>
            ) : query.isError ? (
                <ErrorState title="Não foi possível carregar os plugins" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
            ) : !items.length ? (
                <EmptyState icon={Blocks} title={query.data?.length ? "Nenhum plugin com estes filtros" : "Nenhum plugin ainda"} description={query.data?.length ? "Ajuste a busca ou o escopo." : emptyDescription} />
            ) : (
                <CadastroTableCard>
                    <ul className="divide-y">
                        <AnimatePresence initial={false}>
                            {items.map((plugin) => (
                                <motion.li key={plugin.id} layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                                    <PluginRow plugin={plugin} onOpen={() => router.push(detailHref(plugin.id))} />
                                </motion.li>
                            ))}
                        </AnimatePresence>
                    </ul>
                </CadastroTableCard>
            )}
        </div>
    )
}
