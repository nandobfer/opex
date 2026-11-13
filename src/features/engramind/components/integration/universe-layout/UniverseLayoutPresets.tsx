"use client"

import { matchesUniverseLayoutPreset, UNIVERSE_LAYOUT_PRESETS, type UniverseLayoutConfig } from "@engramind/client"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Grade das predefinições (também no skeleton da aba). */
export const UNIVERSE_PRESETS_GRID = "grid gap-2 sm:grid-cols-2 xl:grid-cols-4"

/** Predefinições da lib: aplicam no formulário como alteração pendente (nada é gravado até Salvar). */
export function UniverseLayoutPresets({ values, onApply }: { values: UniverseLayoutConfig; onApply: (config: UniverseLayoutConfig) => void }) {
    return (
        <div className={UNIVERSE_PRESETS_GRID} role="group" aria-label="Predefinições">
            {UNIVERSE_LAYOUT_PRESETS.map((preset) => {
                // Ativo ignorando o `authorLinks`, que nenhum preset muda (OPE-164).
                const active = matchesUniverseLayoutPreset(values, preset)
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
