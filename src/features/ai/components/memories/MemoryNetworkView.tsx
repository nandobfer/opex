"use client"

import { useMemo, useState } from "react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorCode } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { MemoryCardActions } from "@/features/engramind/components/network/MemoryCard"
import { MemoryEditorDialog, type MemoryEditorTarget } from "@/features/engramind/components/network/MemoryEditorDialog"
import { MemoryUniverse } from "@/features/engramind/components/network/MemoryUniverse"
import { NetworkSkeleton } from "@/features/engramind/components/network/NetworkSkeleton"
import { NETWORK_CANVAS_COMPACT_CLASS } from "@/features/engramind/components/network/layout-classes"
import { useEngramindQuery } from "@/features/engramind/hooks/useEngramind"
import { STALE_AFTER_DAYS_KEY, useMemoryUsage } from "@/features/engramind/hooks/useEngramindNetwork"
import { DEFAULT_STALE_AFTER_DAYS } from "@/features/engramind/network/network-math"
import type { NetworkMemory } from "@/features/engramind/network/types"
import type { SettingMeta } from "@/features/engramind/types"
import { useMemories, useMemoriesMeta, type MemorySource } from "../../hooks/useMemories"
import type { MemoryDto } from "../../types"
import { PENDING_PREFIX } from "../../memory-list"
import { MemoriesNotices } from "./MemoriesNotices"
import { ChannelLabelsProvider } from "@/features/engramind/components/network/ChannelName"
import { useLocalRemovals } from "@/features/engramind/components/network/useLocalRemovals"
import { isCentralChannel } from "@/features/engramind/network/channel-labels"

/** Memória provisória da criação otimista (`useMemories`). */
const isProvisionalMemory = (id: string) => id.startsWith(PENDING_PREFIX)

/** Memória de uma lista dos agentes → partícula da rede (status do Engramind derivado de ativa/fixada). */
export function memoryDtoToNetwork(memory: MemoryDto, channel: string): NetworkMemory {
    return {
        id: memory.id,
        channel,
        title: memory.resumo,
        text: memory.texto,
        category: memory.categoria,
        status: !memory.ativa ? "archived" : memory.fixada ? "permanent" : "active",
        version: memory.versao,
        createdAt: memory.criadaEm,
        updatedAt: memory.atualizadaEm,
        retrievals: memory.uso?.consultas ?? 0,
        injections: memory.uso?.injecoes ?? 0,
        lastRetrievedAt: memory.uso?.ultimaConsulta ?? null,
        verifiedAt: memory.uso?.verificadaEm ?? null,
        stale: memory.uso?.esquecida === true,
        author: memory.autor,
        fromOwner: memory.doDono,
        originLabel: memory.origin?.label,
    }
}

/**
 * Universo de uma lista de memórias de um agente (`/integracoes/ia`, OPE-109): o canal da lista no
 * centro e uma partícula por memória, com o card de ações (ativar, fixar, editar, excluir). As ações
 * passam pelo serviço das memórias dos agentes (otimistas; conflito de versão com a mensagem exata).
 */
export function MemoryNetworkView({ source, channel, canEdit, canCreate = true, className }: { source: MemorySource; channel: string; canEdit: boolean; canCreate?: boolean; className?: string }) {
    const { query, memories, mutate } = useMemories(source)
    const meta = useMemoriesMeta()
    const usage = useMemoryUsage()
    const settings = useEngramindQuery<{ settings: SettingMeta[] }>("settings")
    const [editor, setEditor] = useState<(MemoryEditorTarget & { memory?: MemoryDto }) | null>(null)
    const [deleting, setDeleting] = useState<MemoryDto | null>(null)
    const localRemovals = useLocalRemovals()
    const byId = useMemo(() => new Map(memories.map((memory) => [memory.id, memory])), [memories])
    const network = useMemo(() => memories.map((memory) => memoryDtoToNetwork(memory, channel)), [memories, channel])
    const staleDays = settings.data?.settings?.find((setting) => setting.key === STALE_AFTER_DAYS_KEY)?.value
    const limits = meta.data ? { textMin: meta.data.textMin, textMax: meta.data.textMax } : undefined
    const categories = meta.data?.categories ?? []

    const actions = useMemo<MemoryCardActions>(
        () => ({
            readOnly: !canEdit,
            onActive: (memory, ativa) => mutate({ type: "active", id: memory.id, ativa }),
            onPin: (memory, fixada) => mutate({ type: "pin", id: memory.id, fixada }),
            onEdit: (memory) => {
                const dto = byId.get(memory.id)
                if (dto) setEditor({ mode: "edit", channel, memory: dto, initial: { texto: dto.texto, categoria: dto.categoria } })
            },
            onDelete: (memory) => setDeleting(byId.get(memory.id) ?? null),
        }),
        [canEdit, mutate, byId, channel],
    )

    return (
        <ChannelLabelsProvider enabled={isCentralChannel(channel)}>
            <div className={cn("flex flex-col gap-3", className)} data-testid="memory-network-view">
                <MemoriesNotices meta={meta.data} channel={channel} />
                {query.isLoading ? (
                    <NetworkSkeleton className={NETWORK_CANVAS_COMPACT_CLASS} />
                ) : query.isError ? (
                    <ErrorState title="Não foi possível carregar as memórias" onRetry={() => void query.refetch()} />
                ) : (
                    <MemoryUniverse
                        center={{ kind: "channel", id: channel, label: channel }}
                        isProvisional={isProvisionalMemory}
                        localRemovals={localRemovals}
                        memories={network}
                        usage={usage.data}
                        staleAfterDays={typeof staleDays === "number" && staleDays > 0 ? staleDays : DEFAULT_STALE_AFTER_DAYS}
                        actions={actions}
                        dataVersion={query.dataUpdatedAt}
                        emptyTitle="Nenhuma memória nesta lista ainda"
                        onCreate={canEdit && canCreate ? () => setEditor({ mode: "create", channel }) : null}
                        createLabel={canEdit && canCreate && network.length > 0 ? "Nova memória" : undefined}
                        className={NETWORK_CANVAS_COMPACT_CLASS}
                    />
                )}
                <MemoryEditorDialog
                    target={editor}
                    limits={limits}
                    categories={categories}
                    onClose={() => setEditor(null)}
                    onSave={(values) =>
                        new Promise<boolean>((resolve) => {
                            if (!editor) return resolve(false)
                            if (editor.mode === "create") {
                                mutate({ type: "create", texto: values.texto, categoria: values.categoria })
                                return resolve(true)
                            }
                            const memory = editor.memory
                            if (!memory) return resolve(false)
                            // O editor só fecha no sucesso: num conflito de versão o texto digitado fica, a lista é
                            // relida e o próximo Salvar usa a versão atual.
                            mutate(
                                { type: "update", id: memory.id, texto: values.texto, categoria: values.categoria, versao: memory.versao },
                                {
                                    onSuccess: () => resolve(true),
                                    onError: (error) => {
                                        resolve(false)
                                        if (apiErrorCode(error) !== "MEMORY_VERSION_CONFLICT") return
                                        void query.refetch().then((result) => {
                                            const current = result.data?.find((item) => item.id === memory.id)
                                            if (current) setEditor((target) => (target?.memory?.id === memory.id ? { ...target, memory: current } : target))
                                        })
                                    },
                                },
                            )
                        })
                    }
                />
                <ConfirmDialog
                    open={deleting !== null}
                    onOpenChange={(next) => !next && setDeleting(null)}
                    title="Excluir memória de vez?"
                    description={deleting ? `"${deleting.resumo}" é apagada do Engramind e deixa de ser usada pelo agente. Para só tirar do contexto, inative.` : undefined}
                    confirmLabel="Excluir memória"
                    variant="destructive"
                    onConfirm={() => {
                        if (deleting) {
                            const id = deleting.id
                            localRemovals.mark(id)
                            mutate({ type: "delete", id }, { onError: () => localRemovals.forget(id) })
                        }
                        setDeleting(null)
                    }}
                />
            </div>
        </ChannelLabelsProvider>
    )
}
