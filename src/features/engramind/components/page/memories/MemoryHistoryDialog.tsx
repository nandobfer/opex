"use client"

import { History, Loader2, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/feedback/EmptyState"
import type { EngramindMemory, MemoryRevision } from "../../../types"
import { engramindSend, route, useEngramindList, useEngramindMutation } from "../../../hooks/useEngramind"
import { formatDateTime } from "../../shared/format"
import { LoadMore } from "../../shared/LoadMore"
import { QueryBoundary } from "../../shared/QueryBoundary"
import { ListSkeleton } from "../../shared/ListSkeleton"

/** Histórico de versões da memória, com "Reverter" (cria uma revisão nova com o texto antigo). */
export function MemoryHistoryDialog({ memory, onOpenChange }: { memory: EngramindMemory; onOpenChange: (open: boolean) => void }) {
    const history = useEngramindList<MemoryRevision>(route("memories", memory.id, "history"), "revisions")
    const revert = useEngramindMutation((version: number) => engramindSend("post", route("memories", memory.id, "revert"), { version }), { invalidate: ["memories"], success: (version) => `Memória revertida para a versão ${version}` })
    return (
        <Dialog open onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Histórico de {memory.id}</DialogTitle>
                    <DialogDescription>Cada edição cria uma versão. Reverter devolve texto, título e categoria numa versão nova.</DialogDescription>
                </DialogHeader>
                <QueryBoundary isLoading={history.isLoading} error={history.error} onRetry={() => void history.refetch()} skeleton={<ListSkeleton rows={3} rowClassName="h-20" />}>
                    {history.items.length === 0 ? (
                        <EmptyState icon={History} title="Sem histórico" />
                    ) : (
                        <ol className="space-y-3">
                            {history.items.map((revision) => (
                                <li key={revision.version} className="space-y-1 rounded-lg border p-3 text-sm">
                                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                        <span className="font-semibold text-foreground">v{revision.version}</span>
                                        {formatDateTime(revision.created_at)} · {revision.author.agent ? `${revision.author.app}/${revision.author.agent}` : revision.author.app} {revision.reason ? `· ${revision.reason}` : ""} · {revision.category}
                                        {revision.version !== memory.version && (
                                            <Button type="button" size="sm" variant="outline" className="ml-auto h-7" onClick={() => revert.mutate(revision.version, { onSuccess: () => onOpenChange(false) })} disabled={revert.isPending}>
                                                {revert.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden /> : <Undo2 className="mr-1 h-3 w-3" aria-hidden />} Reverter
                                            </Button>
                                        )}
                                    </p>
                                    {revision.title && <p className="font-medium">{revision.title}</p>}
                                    <p className="whitespace-pre-wrap">{revision.text}</p>
                                </li>
                            ))}
                        </ol>
                    )}
                </QueryBoundary>
                <LoadMore hasNextPage={Boolean(history.hasNextPage)} isFetchingNextPage={history.isFetchingNextPage} fetchNextPage={history.fetchNextPage} />
            </DialogContent>
        </Dialog>
    )
}
