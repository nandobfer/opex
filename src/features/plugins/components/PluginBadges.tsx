import { Archive } from "lucide-react"
import { cn } from "@/lib/utils"
import { slotNode, slotPathLabel } from "../slot-tree"
import { PLUGIN_SCOPE_LABELS, PLUGIN_VERSION_STATE_LABELS, type PluginScope, type PluginVersionState } from "../constants"

/** Selos dos plugins (OPE-172), só com tokens do tema. */

const STATE_CLASSES: Record<PluginVersionState, string> = {
    draft: "border-border bg-muted text-muted-foreground",
    preview: "border-primary/40 bg-primary/15 text-primary",
    stable: "border-success/40 bg-success/15 text-success",
    archived: "border-border bg-transparent text-muted-foreground",
}

export function PluginVersionBadge({ state, number, className }: { state: PluginVersionState; number?: number; className?: string }) {
    return (
        <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium", STATE_CLASSES[state], className)}>
            {PLUGIN_VERSION_STATE_LABELS[state]}
            {number !== undefined && <span className="font-mono">v{number}</span>}
        </span>
    )
}

export function PluginScopeBadge({ scope, clientName }: { scope: PluginScope; clientName?: string | null }) {
    return (
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
            {PLUGIN_SCOPE_LABELS[scope]}
            {scope === "client" && clientName ? <span className="text-foreground">· {clientName}</span> : null}
        </span>
    )
}

export function PluginArchivedBadge() {
    return (
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            <Archive className="h-3 w-3" aria-hidden />
            Arquivado
        </span>
    )
}

/** Selos dos slots ocupados: o rótulo do slot, com o caminho completo na dica e no nome acessível. */
export function PluginSlotBadges({ slots, className }: { slots: readonly string[]; className?: string }) {
    if (!slots.length) return null
    return (
        <span className={cn("flex flex-wrap items-center gap-1", className)} data-testid="plugin-slot-badges">
            {slots.map((slot) => (
                <span key={slot} title={slotPathLabel(slot)} aria-label={`Slot: ${slotPathLabel(slot)}`} className="inline-flex items-center whitespace-nowrap rounded-full border border-primary/30 px-2 py-0.5 text-[11px] text-primary">
                    {slotNode(slot)?.label ?? slot}
                </span>
            ))}
        </span>
    )
}
