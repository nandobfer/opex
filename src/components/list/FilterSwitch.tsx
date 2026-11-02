"use client"

import type { LucideIcon } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

interface FilterSwitchProps {
    icon: LucideIcon
    text: string
    ariaLabel: string
    checked: boolean
    onCheckedChange: (checked: boolean) => void
    className?: string
}

/** Switch de filtro com ícone e texto, na altura dos demais campos (`h-10`) e com o fundo do card. */
export function FilterSwitch({ icon: Icon, text, ariaLabel, checked, onCheckedChange, className }: FilterSwitchProps) {
    return (
        <div className={cn("flex h-10 items-center gap-2 rounded-md border border-input bg-transparent px-3", className)}>
            <Icon className={checked ? "h-4 w-4 text-primary" : "h-4 w-4 text-muted-foreground"} aria-hidden />
            <span className="text-sm">{text}</span>
            <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={ariaLabel} />
        </div>
    )
}
