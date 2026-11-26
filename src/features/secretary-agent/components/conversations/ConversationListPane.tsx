"use client"

import { useMemo, useRef } from "react"
import Fuse from "fuse.js"
import { Bot, MessagesSquare, Search } from "lucide-react"
import { CadastroSearchPicker } from "@/components/list/CadastroSearchPicker"
import { VirtualStack } from "@/components/list/VirtualStack"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { cn } from "@/lib/utils"
import { EvolutionSyncAction } from "@/features/evolution-api/components/EvolutionSyncAction"
import { CONVERSATION_STATE_LABELS, type ConversationAgentState } from "../../constants"
import { CONVERSATION_FILTER_LABELS, CONVERSATION_FILTERS, filterConversations, type ConversationFilter } from "../../chat-timeline"
import type { SecretaryConversationDto } from "../../types"
import { ConversationListItem } from "./ConversationListItem"

export interface InboxListFilters {
    busca: string
    filtro: ConversationFilter
    secretario: ConversationAgentState[]
}

const STATE_OPTIONS = (Object.keys(CONVERSATION_STATE_LABELS) as ConversationAgentState[]).map((value) => ({ value, label: CONVERSATION_STATE_LABELS[value] }))
const chipClass = (active: boolean) => cn("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")

interface ConversationListPaneProps {
    rows: SecretaryConversationDto[] | undefined
    isLoading: boolean
    isError: boolean
    onRetry: () => void
    filters: InboxListFilters
    onFilters: (patch: Partial<InboxListFilters>) => void
    activeId: string | null
    onSelect: (chatId: string) => void
    minutes: number
}

/** Skeleton da lista com a mesma estrutura dos itens (avatar, nome, prévia). */
export function ConversationListSkeleton() {
    return (
        <div aria-busy="true" aria-label="Carregando conversas">
            {[0, 1, 2, 3, 4].map((row) => (
                <div key={row} className="flex items-center gap-3 border-b border-border px-3 py-2.5">
                    <Skeleton className="h-11 w-11 rounded-full" />
                    <div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" /></div>
                </div>
            ))}
        </div>
    )
}

/**
 * Lista da aba Conversas (molde do Atendimento): busca por nome ou número (fuse.js), chips Todas/Não lidas e o filtro
 * do estado do Secretário; virtualizada acima de 50. Sem conversas, "Nenhuma conversa ainda." com a sincronização (que,
 * sem instância escolhida, leva à aba Instância da integração).
 */
export function ConversationListPane({ rows, isLoading, isError, onRetry, filters, onFilters, activeId, onSelect, minutes }: ConversationListPaneProps) {
    const scroll = useRef<HTMLDivElement>(null)
    const fuse = useMemo(() => new Fuse(rows ?? [], { keys: ["name", "number"], threshold: 0.35, ignoreLocation: true }), [rows])
    const visible = useMemo(() => {
        const found = filters.busca.trim() ? fuse.search(filters.busca.trim()).map((result) => result.item) : (rows ?? [])
        return filterConversations(found, filters.filtro, filters.secretario)
    }, [fuse, rows, filters])
    const filtering = Boolean(filters.busca.trim()) || filters.filtro !== "todas" || filters.secretario.length > 0
    return (
        <div className="flex h-full min-h-0 w-full flex-col">
            <div className="space-y-2 border-b border-border px-3 py-2">
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
                    <Input value={filters.busca} onChange={(event) => onFilters({ busca: event.target.value })} placeholder="Buscar nome ou número" aria-label="Buscar conversas" className="h-9 bg-transparent pl-8" />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    {CONVERSATION_FILTERS.map((value) => (
                        <button key={value} type="button" className={chipClass(filters.filtro === value)} aria-pressed={filters.filtro === value} onClick={() => onFilters({ filtro: value })}>
                            {CONVERSATION_FILTER_LABELS[value]}
                        </button>
                    ))}
                </div>
                <CadastroSearchPicker icon={Bot} aria-label="Secretário" placeholder="Secretário: todos os estados" searchPlaceholder="Buscar estado" pluralNoun="estados" options={STATE_OPTIONS} selected={filters.secretario} onSelect={(values) => onFilters({ secretario: values as ConversationAgentState[] })} />
            </div>
            <div ref={scroll} className="min-h-0 flex-1 overflow-y-auto" role="list" aria-label="Conversas">
                {isLoading ? (
                    <ConversationListSkeleton />
                ) : isError ? (
                    <ErrorState title="Não foi possível carregar as conversas" onRetry={onRetry} />
                ) : (rows ?? []).length === 0 ? (
                    <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
                        <MessagesSquare className="h-8 w-8 text-muted-foreground" aria-hidden />
                        <p>Nenhuma conversa ainda.</p>
                        <EvolutionSyncAction />
                    </div>
                ) : visible.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-muted-foreground">{filtering ? "Nenhuma conversa com estes filtros." : "Nenhuma conversa."}</p>
                ) : (
                    <VirtualStack count={visible.length} scrollRef={scroll} estimateSize={76} getKey={(index) => visible[index]!.chatId} renderItem={(index) => <ConversationListItem conversation={visible[index]!} active={visible[index]!.chatId === activeId} minutes={minutes} onSelect={onSelect} />} />
                )}
            </div>
        </div>
    )
}
