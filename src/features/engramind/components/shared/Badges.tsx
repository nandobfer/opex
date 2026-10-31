"use client"

import { Badge } from "@/components/ui/badge"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import { cn } from "@/lib/utils"

/** Selo com tooltip (status, modo, tipo, escopo...). */
export function HelpBadge({ value, help, tone = "outline", className }: { value: string; help?: string; tone?: "outline" | "success" | "warning" | "destructive" | "secondary"; className?: string }) {
    return (
        <span className="inline-flex items-center gap-1">
            <Badge variant={tone} className={cn("font-mono text-[10px] font-normal", className)}>
                {value}
            </Badge>
            {help && <InfoTooltip text={help} label={value} />}
        </span>
    )
}

const TONES: Record<string, "success" | "warning" | "destructive" | "secondary" | "outline"> = {
    active: "success",
    ok: "success",
    ready: "success",
    done: "success",
    delivered: "success",
    success: "success",
    permanent: "secondary",
    queued: "secondary",
    running: "warning",
    reindexing: "warning",
    pending: "warning",
    skip: "outline",
    off: "outline",
    expired: "warning",
    archived: "outline",
    revoked: "destructive",
    failed: "destructive",
    fail: "destructive",
}

export const toneOf = (value: string | null | undefined) => (value ? (TONES[value] ?? "outline") : "outline")
