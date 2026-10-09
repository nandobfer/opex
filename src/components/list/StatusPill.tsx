import { cn } from "@/lib/utils"

interface StatusPillProps {
    active: boolean
    activeLabel?: string
    inactiveLabel?: string
    className?: string
}

export const StatusPill = ({ active, activeLabel = "Ativo", inactiveLabel = "Inativo", className }: StatusPillProps) => {
    return (
        <span
            className={cn(
                "rounded-full px-2 py-1 text-xs font-bold",
                active ? "bg-green-100 text-green-700 dark:bg-emerald-900/40 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
                className,
            )}
        >
            {active ? activeLabel : inactiveLabel}
        </span>
    )
}
