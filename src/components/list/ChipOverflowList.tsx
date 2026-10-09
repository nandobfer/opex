"use client"

import type { ElementType } from "react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export interface OverflowChipItem {
    key: string
    label: string
    icon?: ElementType
    className: string
}

interface ChipOverflowListProps {
    chips: OverflowChipItem[]
    maxVisible?: number
    emptyLabel?: string
}

function ChipBadge({ chip }: { chip: OverflowChipItem }) {
    const Icon = chip.icon
    return (
        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase whitespace-nowrap", chip.className)}>
            {Icon && <Icon size={10} className="shrink-0" />}
            {chip.label}
        </span>
    )
}

export function ChipOverflowList({
    chips,
    maxVisible = 2,
    emptyLabel = "Todos",
}: ChipOverflowListProps) {
    if (chips.length === 0) {
        return <span className="text-xs italic text-muted-foreground/50">{emptyLabel}</span>
    }

    const visible = chips.slice(0, maxVisible)
    const hidden = chips.slice(maxVisible)

    return (
        <div className="flex items-center gap-1.5 flex-wrap">
            {visible.map((chip) => (
                <ChipBadge key={chip.key} chip={chip} />
            ))}

            {hidden.length > 0 && (
                <TooltipProvider>
                    <Tooltip delayDuration={200}>
                        <TooltipTrigger asChild>
                            <span className="inline-flex cursor-default items-center px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-muted-foreground hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                                +{hidden.length}
                            </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="p-2">
                            <div className="flex flex-col gap-1">
                                {hidden.map((chip) => (
                                    <ChipBadge key={chip.key} chip={chip} />
                                ))}
                            </div>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            )}
        </div>
    )
}
