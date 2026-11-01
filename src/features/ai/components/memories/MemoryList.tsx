"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Brain, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { cn } from "@/lib/utils"
import { memoryCountLabel } from "../../memory-list"
import { useMemories, useMemoriesMeta, type MemorySource } from "../../hooks/useMemories"
import type { MemoryDto } from "../../types"
import { MemoryEditor } from "./MemoryEditor"
import { MEMORY_ROW_CLASS, MemoryRow } from "./MemoryRow"
import { MemoriesNotices } from "./MemoriesNotices"

interface MemoryListProps {
    source: MemorySource
    /** Canal do Engramind da lista (aviso de memórias fora do contexto). */
    channel?: string | null
    /** Sem edição: a lista fica somente leitura (sem adicionar, editar ou excluir). */
    canEdit: boolean
    /** Sem "Nova memória" (lista em que só o agente cria). */
    canCreate?: boolean
    emptyTitle: string
    emptyDescription?: string
    className?: string
}

const expand = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

/** Skeleton com a mesma estrutura da lista (barra de ações + linhas). */
export function MemoryListSkeleton() {
    return (
        <div className="flex flex-col gap-3" data-testid="memory-list-skeleton">
            <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-8 w-36" />
                <Skeleton className="h-4 w-28" />
            </div>
            <ul className="flex flex-col divide-y rounded-lg border" aria-hidden>
                {[0, 1, 2].map((index) => (
                    <li key={index} className={cn(MEMORY_ROW_CLASS, "flex items-center gap-2 py-3")}>
                        <Skeleton className="h-4 w-4 shrink-0 rounded-full" />
                        <Skeleton className="h-4 flex-1" />
                        <Skeleton className="h-5 w-16" />
                        <Skeleton className="h-6 w-28" />
                    </li>
                ))}
            </ul>
        </div>
    )
}

/**
 * Lista compacta de memórias de um agente (Engramind): ativas primeiro (fixadas no topo) e as inativas
 * depois, esmaecidas. Criar, editar (texto + categoria, com a versão lida), fixar, ativar/inativar e
 * excluir são otimistas. No conflito de versão o editor continua aberto com o texto digitado.
 */
export function MemoryList({ source, channel, canEdit, canCreate = true, emptyTitle, emptyDescription, className }: MemoryListProps) {
    const { query, memories, mutate } = useMemories(source)
    const meta = useMemoriesMeta()
    const [openId, setOpenId] = useState<string | null>(null)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [creating, setCreating] = useState(false)
    const [deleting, setDeleting] = useState<MemoryDto | null>(null)
    const limits = meta.data ? { textMin: meta.data.textMin, textMax: meta.data.textMax } : undefined
    const categories = meta.data?.categories ?? []

    return (
        <div className={cn("flex flex-col gap-3", className)}>
            <MemoriesNotices meta={meta.data} channel={channel} />
            {query.isLoading ? (
                <MemoryListSkeleton />
            ) : query.isError ? (
                <ErrorState title="Não foi possível carregar as memórias" onRetry={() => void query.refetch()} />
            ) : (
                <>
                    {canEdit && canCreate && (
                        <AnimatePresence initial={false} mode="wait">
                            {creating ? (
                                <motion.div key="editor" {...expand} className="overflow-hidden">
                                    <MemoryEditor
                                        label="Nova memória"
                                        limits={limits}
                                        categories={categories}
                                        onCancel={() => setCreating(false)}
                                        onSave={(values) => {
                                            mutate({ type: "create", texto: values.texto, categoria: values.categoria })
                                            setCreating(false)
                                        }}
                                    />
                                </motion.div>
                            ) : (
                                <motion.div key="button" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-wrap items-center justify-between gap-2">
                                    <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
                                        <Plus className="h-4 w-4" aria-hidden /> Nova memória
                                    </Button>
                                    <span data-testid="memory-count" className="text-xs text-muted-foreground">
                                        {memoryCountLabel(memories)}
                                    </span>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    )}

                    {memories.length === 0 && !creating ? (
                        <EmptyState icon={Brain} title={emptyTitle} description={emptyDescription} />
                    ) : (
                        <ul className="flex flex-col divide-y rounded-lg border" aria-label="Memórias">
                            <AnimatePresence initial={false}>
                                {memories.map((memory) => (
                                    <MemoryRow
                                        key={memory.id}
                                        memory={memory}
                                        canEdit={canEdit}
                                        open={openId === memory.id}
                                        editing={editingId === memory.id}
                                        limits={limits}
                                        categories={categories}
                                        onToggle={() => setOpenId(openId === memory.id ? null : memory.id)}
                                        onEdit={() => {
                                            setOpenId(memory.id)
                                            setEditingId(memory.id)
                                        }}
                                        onCancelEdit={() => setEditingId(null)}
                                        // O editor só fecha no sucesso: num conflito de versão o texto digitado fica.
                                        onSave={(values) => mutate({ type: "update", id: memory.id, texto: values.texto, categoria: values.categoria, versao: memory.versao }, { onSuccess: () => setEditingId(null) })}
                                        onPin={(fixada) => mutate({ type: "pin", id: memory.id, fixada })}
                                        onActive={(ativa) => mutate({ type: "active", id: memory.id, ativa })}
                                        onDelete={() => setDeleting(memory)}
                                    />
                                ))}
                            </AnimatePresence>
                        </ul>
                    )}
                </>
            )}

            <ConfirmDialog
                open={deleting !== null}
                onOpenChange={(next) => !next && setDeleting(null)}
                title="Excluir memória de vez?"
                description={deleting ? `"${deleting.resumo}" é apagada do Engramind e deixa de ser usada pelo agente. Para só tirar do contexto, inative.` : undefined}
                confirmLabel="Excluir memória"
                variant="destructive"
                onConfirm={() => {
                    if (deleting) mutate({ type: "delete", id: deleting.id })
                    setDeleting(null)
                }}
            />
        </div>
    )
}
