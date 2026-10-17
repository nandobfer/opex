import { useRef, type ReactNode } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"

/** Mantém listas pequenas naturais; acima de 50 monta somente a janela visível. */
export function VirtualItems<T>({
    items,
    getKey,
    render,
    estimate = 90,
}: {
    items: T[]
    getKey: (item: T) => string
    render: (item: T) => ReactNode
    estimate?: number
}) {
    const scroll = useRef<HTMLDivElement>(null)
    const reduced = useReducedMotion()
    const virtual = useVirtualizer({
        count: items.length,
        getScrollElement: () => scroll.current,
        estimateSize: () => estimate,
        overscan: 5,
        enabled: items.length > 50,
    })
    if (items.length <= 50)
        return (
            <div className="space-y-3">
                <AnimatePresence initial={false}>
                    {items.map((item) => (
                        <motion.div
                            key={getKey(item)}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: reduced ? 0 : 0.15 }}
                        >
                            {render(item)}
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        )
    return (
        <div ref={scroll} className="h-[600px] overflow-auto">
            <div className="relative w-full" style={{ height: virtual.getTotalSize() }}>
                {virtual.getVirtualItems().map((row) => (
                    <div
                        key={getKey(items[row.index])}
                        data-index={row.index}
                        ref={virtual.measureElement}
                        className="absolute left-0 top-0 w-full pb-3"
                        style={{ transform: `translateY(${row.start}px)` }}
                    >
                        {render(items[row.index])}
                    </div>
                ))}
            </div>
        </div>
    )
}
