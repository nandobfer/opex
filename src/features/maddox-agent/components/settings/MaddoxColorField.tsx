"use client"

import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { normalizeColor } from "@/lib/colors"
import { ColorPaletteField } from "@/features/color-palette/components/ColorPaletteField"
import { CHAT_AGENTS } from "@/features/opex-agent/components/agents/agent-descriptors"
import { agentColorStyle } from "../../colors"
import type { MaddoxAgentSettings } from "../../schemas"

/** Cor do Agente Maddox (seletor de cores com as favoritas ou a primária), com prévia do ícone na cor escolhida. */
export function MaddoxColorField({ form }: { form: UseFormReturn<MaddoxAgentSettings> }) {
    const color = useWatch({ control: form.control, name: "color" })
    const Icon = CHAT_AGENTS.maddox.icon
    return (
        <div className="space-y-1.5">
            <p id="maddox-color" className="text-sm font-medium">
                Cor do agente
            </p>
            <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                    <Controller
                        control={form.control}
                        name="color"
                        render={({ field, fieldState }) => (
                            <>
                                <ColorPaletteField id="maddox-color-picker" aria-labelledby="maddox-color" value={normalizeColor(field.value)} onChange={field.onChange} allowNone noneLabel="Primária (padrão)" />
                                {fieldState.error?.message && (
                                    <p role="alert" className="text-xs text-destructive">
                                        {fieldState.error.message}
                                    </p>
                                )}
                            </>
                        )}
                    />
                </div>
                <span style={agentColorStyle(color)} data-testid="maddox-color-preview">
                    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors" aria-hidden>
                        <Icon className="h-4.5 w-4.5" />
                    </span>
                </span>
            </div>
            <p className="text-xs text-muted-foreground">Pinta o ícone da barra lateral, o ponto de atividade, o cabeçalho, os destaques e as bolhas do chat, no app e no portal.</p>
        </div>
    )
}
