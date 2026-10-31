"use client"

import { useMemo, useState } from "react"
import { Hash, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { CadastroTableCard } from "@/components/list/CadastroTableCard"
import { SearchInput } from "@/components/list/SearchInput"
import { VirtualizedRows } from "@/components/list/VirtualizedRows"
import { EmptyState } from "@/components/feedback/EmptyState"
import type { EngramindChannel } from "../../../types"
import { engramindSend, route, useEngramindList, useEngramindMutation } from "../../../hooks/useEngramind"
import { LoadMore } from "../../shared/LoadMore"
import { QueryBoundary } from "../../shared/QueryBoundary"
import { ChannelDialog } from "./ChannelDialog"
import { ChannelRow, type ChannelAction } from "./ChannelRow"

const CONFIRM: Record<"archive" | "delete", { title: (slug: string) => string; description: string; label: string }> = {
    archive: { title: (slug) => `Arquivar o canal ${slug}?`, description: "Sai do contexto, da busca e das dicas e deixa de receber escrita. Restaurar desfaz.", label: "Arquivar" },
    delete: { title: (slug) => `Excluir de vez o canal ${slug}?`, description: "Saem junto as memórias (com as revisões) e as assinaturas exatas. Não dá para desfazer.", label: "Excluir de vez" },
}

/** Aba Canais: lista com as estatísticas; criar, editar, arquivar/restaurar e excluir (com confirmação). */
export function ChannelsTab({ onConfigure }: { onConfigure: () => void }) {
    const [includeArchived, setIncludeArchived] = useState(false)
    const [search, setSearch] = useState("")
    const [editing, setEditing] = useState<EngramindChannel | null | "new">(null)
    const [confirm, setConfirm] = useState<{ action: "archive" | "delete"; channel: EngramindChannel } | null>(null)
    const channels = useEngramindList<EngramindChannel>("channels", "channels", { include_archived: includeArchived })
    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase()
        return term ? channels.items.filter((channel) => channel.slug.includes(term) || channel.name.toLowerCase().includes(term)) : channels.items
    }, [channels.items, search])
    const act = useEngramindMutation(({ action, channel }: { action: "archive" | "restore" | "delete"; channel: EngramindChannel }) => (action === "delete" ? engramindSend("delete", route("channels", channel.slug)) : engramindSend("post", route("channels", channel.slug, action), {})), {
        invalidate: ["channels", "memories"],
        success: ({ action }) => (action === "archive" ? "Canal arquivado" : action === "restore" ? "Canal restaurado" : "Canal excluído"),
    })
    const onAction = (action: ChannelAction, channel: EngramindChannel) => {
        if (action === "edit") setEditing(channel)
        else if (action === "restore") act.mutate({ action, channel })
        else setConfirm({ action, channel })
    }
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
                <SearchInput value={search} onChange={setSearch} placeholder="Buscar por slug ou nome" label="Buscar canais" className="min-w-56" />
                <span className="flex items-center gap-2 text-sm">
                    <Switch id="channels-archived" checked={includeArchived} onCheckedChange={setIncludeArchived} />
                    <Label htmlFor="channels-archived">Mostrar arquivados</Label>
                </span>
                <Button type="button" className="ml-auto" onClick={() => setEditing("new")}>
                    <Plus className="mr-1.5 h-4 w-4" aria-hidden /> Novo canal
                </Button>
            </div>
            <QueryBoundary isLoading={channels.isLoading} error={channels.error} onRetry={() => void channels.refetch()} skeleton={<ChannelsSkeleton />} onConfigure={onConfigure}>
                <CadastroTableCard>
                    {filtered.length === 0 ? (
                        <EmptyState icon={Hash} title={search ? "Nenhum canal encontrado" : "Nenhum canal"} description="Canais hierárquicos guardam as memórias (ex.: eng/global)." actionLabel="Novo canal" onAction={() => setEditing("new")} />
                    ) : (
                        <VirtualizedRows rows={filtered} rowKey={(channel) => channel.id} estimateSize={64} rowClassName="border-b last:border-b-0" renderRow={(channel) => <ChannelRow channel={channel} onAction={onAction} />} />
                    )}
                </CadastroTableCard>
                <LoadMore hasNextPage={Boolean(channels.hasNextPage)} isFetchingNextPage={channels.isFetchingNextPage} fetchNextPage={channels.fetchNextPage} />
            </QueryBoundary>
            {editing !== null && <ChannelDialog key={editing === "new" ? "new" : editing.id} channel={editing === "new" ? null : editing} open onOpenChange={(open) => !open && setEditing(null)} />}
            <ConfirmDialog
                open={confirm !== null}
                onOpenChange={(open) => !open && setConfirm(null)}
                title={confirm ? CONFIRM[confirm.action].title(confirm.channel.slug) : ""}
                description={confirm ? CONFIRM[confirm.action].description : undefined}
                confirmLabel={confirm ? CONFIRM[confirm.action].label : ""}
                variant="destructive"
                pending={act.isPending}
                onConfirm={() => confirm && act.mutate(confirm, { onSettled: () => setConfirm(null) })}
            />
        </div>
    )
}

export function ChannelsSkeleton() {
    return (
        <div className="space-y-2 rounded-xl border p-3" aria-busy="true">
            {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
            ))}
        </div>
    )
}
