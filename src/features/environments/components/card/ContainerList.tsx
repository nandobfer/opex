"use client"

import { AnimatePresence, motion } from "framer-motion"
import { cn } from "@/lib/utils"
import type { ContainerPortDto } from "../../container-ports"
import { shortLimitsText, type ResourceLimits } from "../../resource-limits"
import { CONTAINER_GRID, CONTAINER_HEAD_CLASS, CONTAINER_ROW_CLASS } from "./environment-card-layout"
import { containerDotState, StateDot } from "./EnvironmentStateDot"
import { PortChip } from "./PortChip"

export interface ContainerItem {
    service: string
    container?: string
    state: string
    status: string
    listen: ContainerPortDto[]
    cpu?: string | null
    memory?: string | null
    limits?: ResourceLimits | null
}

type Variant = keyof typeof CONTAINER_GRID

const memoryUsed = (memory: string | null | undefined) => memory?.split("/")[0]?.trim() || null

/** Rótulo da coluna, só abaixo de `md` (no `md` o cabeçalho da lista nomeia as colunas). */
const Label = ({ children }: { children: string }) => <span className="w-20 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground md:hidden">{children}</span>

function Resources({ item }: { item: ContainerItem }) {
    const used = [item.cpu ? `CPU ${item.cpu}` : null, memoryUsed(item.memory) ? `RAM ${memoryUsed(item.memory)}` : null].filter(Boolean).join(" · ")
    return (
        <div className="flex min-w-0 items-baseline gap-2 md:block">
            <Label>Recursos</Label>
            <div className="min-w-0">
                <p className="truncate text-xs text-foreground">{used || "—"}</p>
                {item.limits && <p className="truncate text-[11px] text-muted-foreground">limite: {shortLimitsText(item.limits)}</p>}
            </div>
        </div>
    )
}

/** Containers do ambiente, um por linha, com o estado, a situação, as portas e (no dono) o uso e os limites. */
export function ContainerList({ items, host, variant, emptyText }: { items: ContainerItem[]; host: string; variant: Variant; emptyText: string }) {
    if (!items.length) return <p className="px-2 py-1 text-xs text-muted-foreground">{emptyText}</p>
    const grid = CONTAINER_GRID[variant]
    return (
        <div>
            <div className={cn(CONTAINER_HEAD_CLASS, grid)} aria-hidden>
                <span>Serviço</span>
                <span>Situação</span>
                <span>Portas</span>
                {variant === "owner" && <span>Recursos</span>}
            </div>
            <ul aria-label="Containers">
                <AnimatePresence initial={false}>
                    {items.map((item) => (
                        <motion.li key={item.container ?? item.service} layout="position" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className={cn(CONTAINER_ROW_CLASS, grid)} data-service={item.service}>
                            <div className="flex min-w-0 items-center gap-2" title={item.container}>
                                <StateDot state={containerDotState(item.state)} />
                                <span className="truncate font-mono text-sm font-medium text-foreground">{item.service}</span>
                            </div>
                            <div className="flex min-w-0 items-baseline gap-2 md:block">
                                <Label>Situação</Label>
                                <span className="truncate text-xs text-muted-foreground">{item.status || item.state}</span>
                            </div>
                            <div className="flex min-w-0 items-start gap-2 md:block">
                                <Label>Portas</Label>
                                {item.listen.length ? (
                                    <div className="flex flex-wrap gap-1.5">
                                        {item.listen.map((port) => (
                                            <PortChip key={`${port.container}/${port.protocol}/${port.published ?? ""}/${port.hostIp ?? ""}`} port={port} host={host} />
                                        ))}
                                    </div>
                                ) : (
                                    <span className="text-xs text-muted-foreground" title="O Docker só conhece as portas do EXPOSE da imagem e do ports do compose">
                                        sem porta declarada
                                    </span>
                                )}
                            </div>
                            {variant === "owner" && <Resources item={item} />}
                        </motion.li>
                    ))}
                </AnimatePresence>
            </ul>
        </div>
    )
}
