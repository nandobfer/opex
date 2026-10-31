"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Brain, FileUp, Info, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { CadastroTableCard } from "@/components/list/CadastroTableCard"
import { VirtualizedRows } from "@/components/list/VirtualizedRows"
import { EmptyState } from "@/components/feedback/EmptyState"
import { MEMORY_STATUSES } from "../../../constants"
import { MEMORY_HELP } from "../../../help/identities"
import type { Category, EngramindChannel, EngramindMemory, SearchResults, SettingMeta } from "../../../types"
import { engramindSend, route, useEngramindList, useEngramindMutation, useEngramindQuery } from "../../../hooks/useEngramind"
import { dayToIso, FilterSelect } from "../../shared/FilterSelect"
import { LoadMore } from "../../shared/LoadMore"
import { QueryBoundary } from "../../shared/QueryBoundary"
import { ImportMemoriesDialog } from "./ImportMemoriesDialog"
import { MemoryHistoryDialog } from "./MemoryHistoryDialog"
import { MemoryRow, type MemoryAction } from "./MemoryRow"
import { MoveMemoryDialog } from "./MoveMemoryDialog"

type Dialog = { kind: "history" | "move"; memory: EngramindMemory } | { kind: "confirm"; action: "archive" | "delete"; memory: EngramindMemory } | { kind: "import" } | null

/** Aba Memórias: filtros (canal, status, categoria, autor, desde), busca, histórico, ações e importação. */
export function MemoriesTab({ onConfigure }: { onConfigure: () => void }) {
    const [filters, setFilters] = useState<{ channels?: string; status?: string; categories?: string; author: string; since: string }>({ author: "", since: "" })
    const [query, setQuery] = useState("")
    const [search, setSearch] = useState<SearchResults | null>(null)
    const [dialog, setDialog] = useState<Dialog>(null)
    const channels = useEngramindList<EngramindChannel>("channels", "channels", { include_archived: true }, { all: true })
    const settings = useEngramindQuery<{ settings: SettingMeta[] }>("settings")
    const categories = (settings.data?.settings.find((meta) => meta.key === "categories.list")?.value as Category[] | undefined) ?? []
    const maxBatch = settings.data?.settings.find((meta) => meta.key === "limits.max_batch")?.value
    const memories = useEngramindList<EngramindMemory>("memories", "memories", { channels: filters.channels, status: filters.status, categories: filters.categories, author: filters.author.trim() || undefined, since: dayToIso(filters.since) })
    const runSearch = useEngramindMutation((text: string) => engramindSend<SearchResults>("post", "memories/search", { query: text, ...(filters.channels ? { channels: [filters.channels] } : {}), ...(filters.categories ? { categories: [filters.categories] } : {}), include_archived: filters.status === "archived", limit: 50 }), { invalidate: [] })
    const act = useEngramindMutation(({ action, memory }: { action: "pin" | "unpin" | "archive" | "restore" | "delete"; memory: EngramindMemory }) => (action === "delete" ? engramindSend("delete", route("memories", memory.id)) : engramindSend("post", route("memories", memory.id, action), {})), {
        invalidate: ["memories", "channels"],
        success: ({ action }) => ({ pin: "Memória fixada", unpin: "Memória desafixada", archive: "Memória arquivada", restore: "Memória restaurada", delete: "Memória excluída" })[action],
    })
    const onAction = (action: MemoryAction, memory: EngramindMemory) => {
        if (action === "history" || action === "move") setDialog({ kind: action, memory })
        else if (action === "archive" || action === "delete") setDialog({ kind: "confirm", action, memory })
        else act.mutate({ action, memory }, { onSuccess: () => search && setSearch(null) })
    }
    const doSearch = async () => setSearch(query.trim() ? await runSearch.mutateAsync(query.trim()) : null)
    const rows = search ? search.results.map((hit) => hit.memory) : memories.items
    return (
        <div className="flex flex-col gap-4">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <FilterSelect id="mem-channel" label="Canal" value={filters.channels} options={channels.items.map((channel) => channel.slug)} onChange={(value) => setFilters((prev) => ({ ...prev, channels: value }))} />
                <FilterSelect id="mem-status" label="Status" value={filters.status} options={MEMORY_STATUSES} onChange={(value) => setFilters((prev) => ({ ...prev, status: value }))} />
                <FilterSelect id="mem-category" label="Categoria" value={filters.categories} options={categories.map((category) => category.key)} onChange={(value) => setFilters((prev) => ({ ...prev, categories: value }))} />
                <Input aria-label="Autor" placeholder="Autor (app ou app/agente)" value={filters.author} onChange={(event) => setFilters((prev) => ({ ...prev, author: event.target.value }))} className="h-8 bg-transparent text-xs" />
                <Input type="date" aria-label="Desde" value={filters.since} onChange={(event) => setFilters((prev) => ({ ...prev, since: event.target.value }))} className="h-8 bg-transparent text-xs" />
            </div>
            <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(event) => {
                    event.preventDefault()
                    void doSearch()
                }}
            >
                <div className="relative min-w-56 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por sentido e por texto" aria-label="Buscar memórias" className="pl-9" />
                </div>
                <Button type="submit" variant="outline" disabled={runSearch.isPending || !query.trim()}>
                    Buscar
                </Button>
                {search && (
                    <Button type="button" variant="ghost" onClick={() => setSearch(null)}>
                        <X className="mr-1 h-4 w-4" aria-hidden /> Limpar busca
                    </Button>
                )}
                <Button type="button" className="ml-auto" onClick={() => setDialog({ kind: "import" })} disabled={channels.items.length === 0}>
                    <FileUp className="mr-1.5 h-4 w-4" aria-hidden /> Importar
                </Button>
            </form>
            <AnimatePresence initial={false}>
                {search?.mode === "text" && (
                    <motion.p key="text-only" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-1.5 text-xs text-warning">
                        <Info className="h-3.5 w-3.5" aria-hidden /> Busca só textual. {MEMORY_HELP.textOnly}
                    </motion.p>
                )}
            </AnimatePresence>
            <QueryBoundary isLoading={memories.isLoading} error={memories.error} onRetry={() => void memories.refetch()} skeleton={<MemoriesSkeleton />} onConfigure={onConfigure}>
                <CadastroTableCard>
                    {rows.length === 0 ? (
                        <EmptyState icon={Brain} title={search ? "Nada encontrado" : "Nenhuma memória"} description={search ? "Tente outros termos." : "Agentes escrevem memórias pelos canais; você também pode importar um arquivo."} actionLabel={search ? undefined : "Importar"} onAction={() => setDialog({ kind: "import" })} />
                    ) : (
                        <VirtualizedRows rows={rows} rowKey={(memory) => memory.id} estimateSize={110} rowClassName="border-b last:border-b-0" renderRow={(memory) => <MemoryRow memory={memory} onAction={onAction} />} />
                    )}
                </CadastroTableCard>
                {!search && <LoadMore hasNextPage={Boolean(memories.hasNextPage)} isFetchingNextPage={memories.isFetchingNextPage} fetchNextPage={memories.fetchNextPage} />}
            </QueryBoundary>
            {dialog?.kind === "history" && <MemoryHistoryDialog memory={dialog.memory} onOpenChange={(open) => !open && setDialog(null)} />}
            {dialog?.kind === "move" && <MoveMemoryDialog memory={dialog.memory} channels={channels.items} onOpenChange={(open) => !open && setDialog(null)} />}
            {dialog?.kind === "import" && <ImportMemoriesDialog channels={channels.items} maxBatch={typeof maxBatch === "number" ? maxBatch : null} onOpenChange={(open) => !open && setDialog(null)} />}
            <ConfirmDialog
                open={dialog?.kind === "confirm"}
                onOpenChange={(open) => !open && setDialog(null)}
                title={dialog?.kind === "confirm" ? (dialog.action === "delete" ? `Excluir de vez a memória ${dialog.memory.id}?` : `Arquivar a memória ${dialog.memory.id}?`) : ""}
                description={dialog?.kind === "confirm" && dialog.action === "delete" ? "Sai junto o histórico de versões. Não dá para desfazer." : "Sai do contexto e da busca padrão. Restaurar desfaz."}
                confirmLabel={dialog?.kind === "confirm" && dialog.action === "delete" ? "Excluir de vez" : "Arquivar"}
                variant="destructive"
                pending={act.isPending}
                onConfirm={() => dialog?.kind === "confirm" && act.mutate({ action: dialog.action, memory: dialog.memory }, { onSettled: () => setDialog(null) })}
            />
        </div>
    )
}

function MemoriesSkeleton() {
    return (
        <div className="space-y-2 rounded-xl border p-3" aria-busy="true">
            {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-24 w-full" />
            ))}
        </div>
    )
}
