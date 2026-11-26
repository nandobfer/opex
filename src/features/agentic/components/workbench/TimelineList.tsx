"use client"

import { useState, type RefObject } from "react"
import { motion } from "framer-motion"
import { VirtualStack } from "@/components/list/VirtualStack"
import type { TimelineItem } from "../../timeline"
import { TimelineItemView } from "./TimelineItemView"

/** Altura estimada de um item antes de medir (o virtualizador corrige com a medida real). */
const ITEM_ESTIMATE = 72

/**
 * Itens da Saída da IA (OPE-188): inteira até 50 itens e virtualizada acima (TanStack Virtual, altura
 * medida por item) — mesa com milhares de itens desenha só o que está na tela. Só os itens que chegam
 * depois da montagem animam a entrada: a saída que já estava pronta (guardada ou relida) aparece parada.
 */
export function TimelineList({ items, scrollRef, latestCheckKey }: { items: TimelineItem[]; scrollRef: RefObject<HTMLElement | null>; latestCheckKey: string | null }) {
    const [animateFrom] = useState(items.length)
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
                    <motion.div data-timeline-item={item.kind} className={index < last ? "pb-3" : undefined} initial={index >= animateFrom ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
                        <TimelineItemView item={item} latestPrWatch={item.key === latestCheckKey} />
                    </motion.div>
                )
            }}
        />
    )
}
