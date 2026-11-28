"use client"

import { AnimatePresence, motion } from "framer-motion"
import { UsageBars } from "@/components/metrics/UsageBars"
import { cn } from "@/lib/utils"
import type { ContainerPortDto } from "../../container-ports"
import { shortLimitsText, type ResourceLimits } from "../../resource-limits"
import { containerUsage, EMPTY_USAGE, type ContainerUsageDto, type MachineCapacity } from "../../resource-usage"
import type { Machine } from "../../schemas"
import { CONTAINER_USAGE_CLASS } from "./environment-card-layout"
import { usageBarsItems } from "./usage-items"
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
    usage?: ContainerUsageDto
}

type Variant = keyof typeof CONTAINER_GRID

/** Onde os containers rodam e a capacidade da máquina (base do % sem limite). */
export interface UsageContext {
    machine: Machine
    capacity: MachineCapacity | null
}

/** Rótulo da coluna, só abaixo de `md` (no `md` o cabeçalho da lista nomeia as colunas). */
const Label = ({ children }: { children: string }) => <span className="w-20 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground md:hidden">{children}</span>

/** CPU, RAM, swap e disco do container em barras (o % é do limite; sem limite, da máquina). */
function Resources({ item, context }: { item: ContainerItem; context: UsageContext }) {
    const usage = item.usage ?? EMPTY_USAGE
    const set = containerUsage({ running: item.state === "running", usage, limits: item.limits ?? null }, context.capacity)
    const limits = item.limits ? shortLimitsText(item.limits) : null
    return (
        <div className="flex min-w-0 items-start gap-2 md:block" title={limits ? `Limite aplicado: ${limits}` : "Sem limite aplicado: o % é sobre a máquina"}>
            <Label>Recursos</Label>
            <UsageBars items={usageBarsItems(set, context.machine, { scope: item.service, diskCheckedAt: usage.diskCheckedAt })} className={CONTAINER_USAGE_CLASS} />
        </div>
    )
}

/** Containers do ambiente, um por linha, com o estado, a situação, as portas e (no dono) o uso e os limites. */
export function ContainerList({ items, host, variant, emptyText, usage }: { items: ContainerItem[]; host: string; variant: Variant; emptyText: string; usage?: UsageContext }) {
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
                            {variant === "owner" && usage && <Resources item={item} context={usage} />}
                        </motion.li>
                    ))}
                </AnimatePresence>
            </ul>
        </div>
    )
}
