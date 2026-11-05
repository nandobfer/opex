"use client"

import type { ReactNode } from "react"
import { RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { AiAgentId, MemoryListScope } from "../../agents"
import { useMemoriesMeta } from "../../hooks/useMemories"
import { useMemoryDetail } from "../../hooks/useMemoryDetail"
import { NOTICE_MEMORY_ACTION_LABELS, memoryChannelInfo, type NoticeMemoryRef } from "../../memory-notice"
import { MemoryReadingText, MemorySummaryPending } from "./MemoryReading"

/** Altura do texto no painel (o painel cabe abaixo do aviso sem cobrir a tela inteira). */
const PANEL_TEXT_CLASS = "max-h-[min(40vh,18rem)] max-w-none"

interface MemoryDetailLayoutProps {
    title: ReactNode
    agentId: AiAgentId
    scope?: MemoryListScope
    category: ReactNode
    footer: string
    children: ReactNode
}

/** Estrutura do painel: título, canal (lista + slug), categoria, conteúdo e a ação no rodapé. */
export function MemoryDetailLayout({ title, agentId, scope, category, footer, children }: MemoryDetailLayoutProps) {
    const channel = memoryChannelInfo(agentId, scope)
    return (
        <div className="space-y-2.5 pr-6" data-testid="memory-detail">
            <div className="text-sm font-medium leading-snug break-words">{title}</div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Canal</dt>
                <dd className="min-w-0 break-words">
                    {channel.title}
                    {channel.slug && <span className="ml-1.5 font-mono text-muted-foreground">{channel.slug}</span>}
                </dd>
                <dt className="text-muted-foreground">Categoria</dt>
                <dd className="min-w-0 break-words">{category}</dd>
            </dl>
            {children}
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{footer}</p>
        </div>
    )
}

/** Skeleton com a estrutura do painel carregado. */
export function MemoryDetailSkeleton() {
    return (
        <div className="space-y-2.5 pr-6" aria-label="Carregando a memória">
            <Skeleton className="h-4 w-4/5" />
            <div className="space-y-1">
                <Skeleton className="h-3 w-3/5" />
                <Skeleton className="h-3 w-2/5" />
            </div>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-3 w-24" />
        </div>
    )
}

/** Falha ao ler: mensagem e "Tentar novamente". */
export function MemoryDetailError({ onRetry }: { onRetry: () => void }) {
    return (
        <div className="flex flex-wrap items-center gap-2 pr-6">
            <p className="text-sm text-muted-foreground">Não foi possível carregar a memória.</p>
            <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={onRetry}>
                <RotateCw className="h-3.5 w-3.5" aria-hidden /> Tentar novamente
            </Button>
        </div>
    )
}

/** Rótulo da categoria (lista do Engramind); sem rótulo, a chave. */
export function useCategoryLabel(): (key: string) => string {
    const meta = useMemoriesMeta()
    return (key) => meta.data?.categories.find((item) => item.key === key)?.label ?? key
}

/** Memória de um aviso, lida do Engramind ao abrir o painel (montado só aberto). */
export function MemoryDetailCard({ memoryRef }: { memoryRef: NoticeMemoryRef }) {
    const query = useMemoryDetail(memoryRef, true)
    const categoryLabel = useCategoryLabel()
    const footer = NOTICE_MEMORY_ACTION_LABELS[memoryRef.action]
    if (query.gone) {
        return (
            <MemoryDetailLayout title="Memória excluída" agentId={memoryRef.agentId} scope={memoryRef} category="—" footer={footer}>
                <p className="text-sm text-muted-foreground">A memória não está mais no Engramind (excluída ou movida para outra lista).</p>
            </MemoryDetailLayout>
        )
    }
    if (query.isError) return <MemoryDetailError onRetry={() => void query.refetch()} />
    const memory = query.data
    if (!memory) return <MemoryDetailSkeleton />
    return (
        <MemoryDetailLayout
            title={
                <>
                    {memory.resumo}
                    {memory.resumoPendente && <MemorySummaryPending />}
                </>
            }
            agentId={memoryRef.agentId}
            scope={memoryRef}
            category={categoryLabel(memory.categoria)}
            footer={memory.ativa || memoryRef.action === "archived" ? footer : `${footer} · inativa`}
        >
            <MemoryReadingText className={PANEL_TEXT_CLASS}>{memory.texto}</MemoryReadingText>
        </MemoryDetailLayout>
    )
}
