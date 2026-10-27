"use client"

import type { ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Boxes, ChevronDown } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { LocalDockerContainerAction } from "../../schemas"
import type { LocalDockerContainerDto } from "../../types"
import { ContainerRow } from "./ContainerRow"

interface ContainersSectionProps {
    id: string
    title: string
    description: string
    open: boolean
    onToggle: () => void
    items: LocalDockerContainerDto[]
    /** Túnel fechado ou Docker do PC sem resposta. */
    unavailable: string | null
    loading: boolean
    empty: ReactNode
    busy: { name: string; action: LocalDockerContainerAction } | null
    onAction: (name: string, action: LocalDockerContainerAction, confirm?: boolean) => void
}

/** Seção recolhível com os containers de um tipo (prévias ou ambiente do preparo). */
export function ContainersSection({ id, title, description, open, onToggle, items, unavailable, loading, empty, busy, onAction }: ContainersSectionProps) {
    return (
        <Card>
            <CardHeader className="py-4">
                <button type="button" className="flex w-full items-center justify-between gap-2 text-left" aria-expanded={open} aria-controls={`${id}-content`} onClick={onToggle}>
                    <span className="min-w-0">
                        <span className="flex items-center gap-2 text-base font-semibold">
                            <Boxes className="h-4 w-4" aria-hidden /> {title}
                            {!unavailable && !loading && <span className="text-xs font-normal text-muted-foreground">({items.length})</span>}
                        </span>
                        <span className="block text-sm text-muted-foreground">{description}</span>
                    </span>
                    <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
                </button>
            </CardHeader>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div id={`${id}-content`} key="content" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                        <CardContent>
                            {loading ? (
                                <p className="text-sm text-muted-foreground">Consultando o Docker do PC…</p>
                            ) : unavailable ? (
                                <p className="text-sm text-muted-foreground">{unavailable}</p>
                            ) : items.length === 0 ? (
                                empty
                            ) : (
                                <ul className="space-y-2">
                                    <AnimatePresence initial={false}>
                                        {items.map((item) => (
                                            <ContainerRow key={item.name} item={item} busyAction={busy?.name === item.name ? busy.action : null} onAction={(action, confirm) => onAction(item.name, action, confirm)} />
                                        ))}
                                    </AnimatePresence>
                                </ul>
                            )}
                        </CardContent>
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    )
}
