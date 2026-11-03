"use client"

import { useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { format } from "date-fns"
import { ChevronRight, History } from "lucide-react"
import { InfiniteListView } from "@/components/list/InfiniteListView"
import { listItem } from "@/components/motion/presets"
import { cn } from "@/lib/utils"
import { formatRelativePast } from "@/lib/relative-time"
import type { AgentId } from "../catalog"
import { useAgentHistoryPages } from "../hooks/useAgentMetrics"
import type { AgentHistoryItemDto } from "../types"

const TONES: Record<AgentHistoryItemDto["status"]["tone"], string> = {
    success: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    warning: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    danger: "bg-destructive/15 text-destructive ring-destructive/30",
    info: "bg-primary/15 text-primary ring-primary/30",
    muted: "bg-muted text-muted-foreground ring-border",
}

/** Uma linha do Histórico: leva ao item de origem (tarefa, mesa ou conversa) quando ele existe. */
function HistoryRow({ item, now }: { item: AgentHistoryItemDto; now: number }) {
    const body = (
        <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-sm transition-colors hover:bg-muted/40">
            <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                    {format(new Date(item.at), "dd/MM/yyyy HH:mm")} · {formatRelativePast(item.at, now)}
                    {item.subtitle ? ` · ${item.subtitle}` : ""}
                    {item.unavailable ? ` · ${item.unavailable}` : ""}
                </p>
            </div>
            {item.chips.map((chip) => (
                <span key={chip} className="hidden shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] text-muted-foreground md:inline">
                    {chip}
                </span>
            ))}
            <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-[11px] ring-1", TONES[item.status.tone])}>{item.status.label}</span>
            {item.href && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
        </div>
    )
    return (
        <motion.li layout="position" variants={listItem} initial="hidden" animate="visible" exit="hidden">
            {item.href ? (
                <Link href={item.href} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {body}
                </Link>
            ) : (
                body
            )}
        </motion.li>
    )
}

/** Aba **Histórico** dos agentes novos: execuções do período com os filtros da página, rolagem infinita. */
export function AgentHistoryTab({ agent, params, filtering, onClearFilters }: { agent: AgentId; params: Record<string, string>; filtering: boolean; onClearFilters: () => void }) {
    const query = useAgentHistoryPages(agent, params)
    const [now] = useState(() => Date.now())
    const pages = query.data?.pages ?? []
    const items = pages.flatMap((page) => page.items)
    const total = pages[0]?.total ?? 0
    return (
        <InfiniteListView
            query={query}
            count={items.length}
            total={total}
            filtering={filtering}
            onClearFilters={onClearFilters}
            labels={{
                loading: "Carregando o histórico",
                error: "Não foi possível carregar o histórico",
                filteredTitle: "Nada no histórico com estes filtros",
                filteredDescription: "Ajuste o período ou limpe os filtros para ver mais execuções.",
                loadingMore: "Carregando mais…",
            }}
            empty={{ icon: History, title: "Nenhuma execução no período", description: "As execuções do agente aparecem aqui assim que ele for usado." }}
        >
            <ul className="space-y-2" aria-label="Histórico do agente">
                <AnimatePresence initial={false}>
                    {items.map((item) => (
                        <HistoryRow key={item.id} item={item} now={now} />
                    ))}
                </AnimatePresence>
            </ul>
        </InfiniteListView>
    )
}
