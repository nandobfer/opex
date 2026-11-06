"use client"

import { sameUniverseLayout, UNIVERSE_LAYOUT_PRESETS, type UniverseLayoutConfig } from "@engramind/client"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Predefinições da lib: aplicam no formulário como alteração pendente (nada é gravado até Salvar). */
export function UniverseLayoutPresets({ values, onApply }: { values: UniverseLayoutConfig; onApply: (config: UniverseLayoutConfig) => void }) {
    return (
        <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Predefinições">
            {UNIVERSE_LAYOUT_PRESETS.map((preset) => {
                const active = sameUniverseLayout(values, preset.config)
                return (
                    <Button key={preset.id} type="button" variant="outline" aria-pressed={active} onClick={() => onApply(preset.config)} className={cn("h-auto flex-col items-start gap-0.5 whitespace-normal bg-transparent px-3 py-2 text-left", active && "border-primary/60 bg-primary/5")}>
                        <span className="text-sm font-semibold">{preset.label}</span>
                        <span className="text-xs font-normal text-muted-foreground">{preset.description}</span>
                    </Button>
                )
            })}
        </div>
    )
}
