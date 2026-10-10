"use client"

import { Tag } from "lucide-react"
import { cn } from "@/lib/utils"
import { tagLabel } from "../tags"
import { useTaskTaxonomy } from "./TaskTaxonomyProvider"

const chip = "inline-flex shrink-0 items-center gap-1 rounded border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground"

/** Tags da tarefa geradas por IA (ids da taxonomia), com o rótulo resolvido na hora. */
export function TaskTagsBadge({ tags, max = 2, className }: { tags: readonly string[]; max?: number; className?: string }) {
    const taxonomy = useTaskTaxonomy()
    if (!tags || tags.length === 0) return null
    const shown = max >= tags.length ? tags : tags.slice(0, max)
    const extra = tags.length - shown.length
    return (
        <span className={cn("inline-flex min-w-0 flex-wrap items-center gap-1", className)} data-testid="task-tags">
            {shown.map((id) => (
                <span key={id} className={chip} title={tagLabel(id, taxonomy)}>
                    <Tag className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="truncate">{tagLabel(id, taxonomy)}</span>
                </span>
            ))}
            {extra > 0 && <span className={chip}>+{extra}</span>}
        </span>
    )
}
