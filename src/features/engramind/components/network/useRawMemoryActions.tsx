"use client"

import { useMemo, useState } from "react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import type { MemoryTextLimits } from "@/features/ai/memory-text"
import type { NetworkMemory } from "../../network/types"
import type { Category, EngramindChannel, EngramindMemory } from "../../types"
import { engramindSend, route, useEngramindMutation } from "../../hooks/useEngramind"
import { MemoryHistoryDialog } from "../page/memories/MemoryHistoryDialog"
import { MoveMemoryDialog } from "../page/memories/MoveMemoryDialog"
import type { MemoryCardActions } from "./MemoryCard"
import { MemoryEditorDialog, type MemoryEditorTarget } from "./MemoryEditorDialog"

type MemoryOp = "pin" | "unpin" | "archive" | "restore" | "delete"
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
    const act = useEngramindMutation(({ op, id }: { op: MemoryOp; id: string }) => (op === "delete" ? engramindSend("delete", route("memories", id)) : engramindSend("post", route("memories", id, op), {})), {
        invalidate: ["memories", "channels"],
        success: ({ op }) => SUCCESS[op],
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
            onActive: (memory, active) => act.mutate({ op: active ? "restore" : "archive", id: memory.id }),
            onPin: (memory, pinned) => act.mutate({ op: pinned ? "pin" : "unpin", id: memory.id }),
            onEdit: (memory) => setEditor({ mode: "edit", channel: memory.channel, memory, initial: { texto: memory.text, categoria: memory.category } }),
            onDelete: (memory) => setDeleting(memory),
            onMove: (memory) => setMove(rawById.get(memory.id) ?? null),
            onHistory: (memory) => setHistory(rawById.get(memory.id) ?? null),
        }),
        [act, rawById],
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
                    } catch {
                        // Conflito de versão: o toast mostra a mensagem e a releitura traz a versão atual.
                        return false
                    }
                }}
            />
            {history && <MemoryHistoryDialog memory={history} onOpenChange={(open) => !open && setHistory(null)} />}
            {move && <MoveMemoryDialog memory={move} channels={channels} onOpenChange={(open) => !open && setMove(null)} />}
            <ConfirmDialog
                open={deleting !== null}
                onOpenChange={(open) => !open && setDeleting(null)}
                title={deleting ? `Excluir de vez a memória ${deleting.id}?` : ""}
                description="Sai junto o histórico de versões. Não dá para desfazer."
                confirmLabel="Excluir de vez"
                variant="destructive"
                pending={act.isPending}
                onConfirm={() => deleting && act.mutate({ op: "delete", id: deleting.id }, { onSettled: () => setDeleting(null) })}
            />
        </>
    )
    return { actions, dialogs, openCreate: (channel: string) => setEditor({ mode: "create", channel }) }
}
