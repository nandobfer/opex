"use client"

import { LeveledSlider } from "@/components/ui/leveled-slider"
import { ARCHITECT_DEPTH_DEFS, ARCHITECT_DEPTHS, type ArchitectDepth } from "../../constants"

/** Slider de profundidade (5 níveis): diretiva do prompt e teto de nós do pedido. */
export function DepthControl({ id, value, onChange, disabled, compact }: { id: string; value: ArchitectDepth; onChange: (depth: ArchitectDepth) => void; disabled?: boolean; compact?: boolean }) {
    const def = ARCHITECT_DEPTH_DEFS[value]
    return (
        <div className="space-y-1">
            <LeveledSlider id={id} label="Profundidade do diagrama" levels={ARCHITECT_DEPTHS} value={value} onChange={onChange} labelOf={(level) => ARCHITECT_DEPTH_DEFS[level].label} disabled={disabled} className={compact ? "px-6 pb-1" : undefined} />
            <p className="text-center text-xs text-muted-foreground">
                {def.content} · até {def.maxNodes} nós
            </p>
        </div>
    )
}

export const asDepth = (value: number): ArchitectDepth => ((ARCHITECT_DEPTHS as readonly number[]).includes(value) ? (value as ArchitectDepth) : 3)
