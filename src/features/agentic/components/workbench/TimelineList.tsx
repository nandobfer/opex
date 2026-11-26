"use client"

import { useState, type ReactNode, type RefObject } from "react"
import { motion } from "framer-motion"
import { VirtualStack } from "@/components/list/VirtualStack"
import type { TimelineItem } from "../../timeline"
import { TimelineItemView } from "./TimelineItemView"

/** Linha da lista: decide na montagem se anima (chave nunca exibida) e registra a chave como exibida. */
function TimelineRow({ known, itemKey, kind, padded, children }: { known: Set<string>; itemKey: string; kind: string; padded: boolean; children: ReactNode }) {
    const [fresh] = useState(() => {
        const isNew = !known.has(itemKey)
        known.add(itemKey)
        return isNew
    })
    return (
        <motion.div data-timeline-item={kind} data-animated={fresh || undefined} className={padded ? "pb-3" : undefined} initial={fresh ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
            {children}
        </motion.div>
    )
}

/** Altura estimada de um item antes de medir (o virtualizador corrige com a medida real). */
const ITEM_ESTIMATE = 72

/**
 * Itens da Saída da IA (OPE-188): inteira até 50 itens e virtualizada acima (TanStack Virtual, altura
 * medida por item) — mesa com milhares de itens desenha só o que está na tela. Só os itens que chegam
 * depois da montagem animam a entrada, uma vez só: a saída que já estava pronta (guardada ou relida)
 * aparece parada e o item que sai da janela virtual e volta não anima de novo (controle por chave).
 */
export function TimelineList({ items, scrollRef, latestCheckKey }: { items: TimelineItem[]; scrollRef: RefObject<HTMLElement | null>; latestCheckKey: string | null }) {
    // Chaves já exibidas: as da montagem entram paradas; cada item novo anima só na primeira vez.
    const [known] = useState(() => new Set(items.map((item) => item.key)))
    const last = items.length - 1
    return (
        <VirtualStack
            count={items.length}
            scrollRef={scrollRef}
            estimateSize={ITEM_ESTIMATE}
            getKey={(index) => items[index]!.key}
            renderItem={(index) => {
                const item = items[index]!
                return (
                    <TimelineRow known={known} itemKey={item.key} kind={item.kind} padded={index < last}>
                        <TimelineItemView item={item} latestPrWatch={item.key === latestCheckKey} />
                    </TimelineRow>
                )
            }}
        />
    )
}
