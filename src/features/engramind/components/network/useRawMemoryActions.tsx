"use client"

import { useMemo, useState } from "react"
import { useMutation, useQueryClient, type InfiniteData, type QueryKey } from "@tanstack/react-query"
import { toast } from "sonner"
import { apiErrorCode, apiErrorMessage } from "@/lib/api"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import type { MemoryTextLimits } from "@/features/ai/memory-text"
import type { NetworkMemory } from "../../network/types"
import type { Category, EngramindChannel, EngramindMemory } from "../../types"
import { areaKey, engramindGet, engramindSend, route, useEngramindMutation } from "../../hooks/useEngramind"
import { toNetworkMemory } from "../../hooks/useEngramindNetwork"
import { MemoryHistoryDialog } from "../page/memories/MemoryHistoryDialog"
import { MoveMemoryDialog } from "../page/memories/MoveMemoryDialog"
import { useLocalRemovals } from "./useLocalRemovals"
import type { MemoryCardActions } from "./MemoryCard"
import { MemoryEditorDialog, type MemoryEditorTarget } from "./MemoryEditorDialog"

type MemoryOp = "pin" | "unpin" | "archive" | "restore" | "delete"
type StatusOp = "pin" | "unpin" | "archive" | "restore"
const NEXT_STATUS: Record<StatusOp, EngramindMemory["status"]> = { pin: "permanent", unpin: "active", archive: "archived", restore: "active" }
type MemoryPages = InfiniteData<{ items: EngramindMemory[]; nextCursor: string | null; truncated: boolean }>
const isMemoryPages = (data: unknown): data is MemoryPages => Array.isArray((data as MemoryPages | undefined)?.pages)

/** Troca o status da memória em todas as listas carregadas (resposta otimista). */
export function setMemoryStatusInCache(data: unknown, id: string, status: EngramindMemory["status"]): unknown {
    if (!isMemoryPages(data)) return data
    return { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.map((memory) => (memory.id === id ? { ...memory, status } : memory)) })) }
}

const SUCCESS: Record<MemoryOp, string> = { pin: "Memória fixada", unpin: "Memória desafixada", archive: "Memória desativada", restore: "Memória ativada", delete: "Memória excluída" }

/**
 * Ações do card da memória na página `/engramind` (Engramind bruto, pelo proxy do Opex): ativar,
 * fixar, editar (com `expected_version`), mover, histórico com Reverter e excluir (com confirmação).
 */
export function useRawMemoryActions({ rawById, channels, categories, limits }: { rawById: Map<string, EngramindMemory>; channels: EngramindChannel[]; categories: Category[]; limits?: MemoryTextLimits }) {
    const [editor, setEditor] = useState<(MemoryEditorTarget & { memory?: NetworkMemory }) | null>(null)
    const [history, setHistory] = useState<EngramindMemory | null>(null)
    const [move, setMove] = useState<EngramindMemory | null>(null)
    const [deleting, setDeleting] = useState<NetworkMemory | null>(null)
    const queryClient = useQueryClient()
    const localRemovals = useLocalRemovals()
    const act = useEngramindMutation(({ op, id }: { op: MemoryOp; id: string }) => (op === "delete" ? engramindSend("delete", route("memories", id)) : engramindSend("post", route("memories", id, op), {})), {
        invalidate: ["memories", "channels"],
        success: ({ op }) => SUCCESS[op],
    })
    // Ativar/desativar e fixar mudam a partícula na hora; a falha volta o estado (animado) com toast.
    const status = useMutation({
        mutationFn: ({ op, id }: { op: StatusOp; id: string }) => engramindSend("post", route("memories", id, op), {}),
        onMutate: async ({ op, id }) => {
            await queryClient.cancelQueries({ queryKey: areaKey("memories") })
            const previous = queryClient.getQueriesData({ queryKey: areaKey("memories") })
            queryClient.setQueriesData({ queryKey: areaKey("memories") }, (data: unknown) => setMemoryStatusInCache(data, id, NEXT_STATUS[op]))
            return { previous }
        },
        onError: (error, _variables, context) => {
            for (const [key, data] of (context?.previous ?? []) as [QueryKey, unknown][]) queryClient.setQueryData(key, data)
            toast.error(apiErrorMessage(error, "Não foi possível concluir a ação no Engramind."))
        },
        onSuccess: (_data, { op }) => toast.success(SUCCESS[op]),
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: areaKey("memories") })
            void queryClient.invalidateQueries({ queryKey: areaKey("channels") })
        },
    })
    const save = useEngramindMutation(
        ({ target, texto, categoria }: { target: MemoryEditorTarget & { memory?: NetworkMemory }; texto: string; categoria: string }) =>
            target.mode === "edit" && target.memory
                ? engramindSend("patch", route("memories", target.memory.id), { text: texto, category: categoria, expected_version: target.memory.version })
                : engramindSend("post", "memories", { channel: target.channel, text: texto, category: categoria }),
        { invalidate: ["memories", "channels"], success: ({ target }) => (target.mode === "edit" ? "Memória atualizada" : "Memória gravada") },
    )

    const actions = useMemo<MemoryCardActions>(
        () => ({
            onActive: (memory, active) => status.mutate({ op: active ? "restore" : "archive", id: memory.id }),
            onPin: (memory, pinned) => status.mutate({ op: pinned ? "pin" : "unpin", id: memory.id }),
            onEdit: (memory) => setEditor({ mode: "edit", channel: memory.channel, memory, initial: { texto: memory.text, categoria: memory.category } }),
            onDelete: (memory) => setDeleting(memory),
            onMove: (memory) => setMove(rawById.get(memory.id) ?? null),
            onHistory: (memory) => setHistory(rawById.get(memory.id) ?? null),
        }),
        [status, rawById],
    )

    const dialogs = (
        <>
            <MemoryEditorDialog
                target={editor}
                limits={limits}
                categories={categories}
                onClose={() => setEditor(null)}
                onSave={async (values) => {
                    if (!editor) return false
                    try {
                        await save.mutateAsync({ target: editor, ...values })
                        return true
                    } catch (error) {
                        // Conflito de versão: relê a memória e o próximo Salvar usa a versão atual (o rascunho fica).
                        if (editor.mode === "edit" && editor.memory && apiErrorCode(error) === "MEMORY_VERSION_CONFLICT") {
                            const memory = editor.memory
                            void queryClient.invalidateQueries({ queryKey: areaKey("memories") })
                            try {
                                const current = toNetworkMemory(await engramindGet<EngramindMemory>(route("memories", memory.id)))
                                setEditor((target) => (target?.memory?.id === memory.id ? { ...target, memory: current } : target))
                            } catch {
                                // Sem a releitura, o próximo Salvar mostra o conflito de novo.
                            }
                        }
                        return false
                    }
                }}
            />
            {history && <MemoryHistoryDialog memory={history} onOpenChange={(open) => !open && setHistory(null)} />}
            {move && <MoveMemoryDialog memory={move} channels={channels} onOpenChange={(open) => !open && setMove(null)} onConfirm={() => localRemovals.mark(move.id)} onFailed={() => localRemovals.forget(move.id)} />}
            <ConfirmDialog
                open={deleting !== null}
                onOpenChange={(open) => !open && setDeleting(null)}
                title={deleting ? `Excluir de vez a memória ${deleting.id}?` : ""}
                description="Sai junto o histórico de versões. Não dá para desfazer."
                confirmLabel="Excluir de vez"
                variant="destructive"
                pending={act.isPending}
                onConfirm={() => {
                    if (!deleting) return
                    const id = deleting.id
                    localRemovals.mark(id)
                    act.mutate({ op: "delete", id }, { onError: () => localRemovals.forget(id), onSettled: () => setDeleting(null) })
                }}
            />
        </>
    )
    return { actions, dialogs, localRemovals, openCreate: (channel: string) => setEditor({ mode: "create", channel }) }
}
