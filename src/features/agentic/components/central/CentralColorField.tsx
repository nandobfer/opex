"use client"

import { Controller, useWatch } from "react-hook-form"
import { normalizeColor } from "@/lib/colors"
import { cn } from "@/lib/utils"
import { ColorPaletteField } from "@/features/color-palette/components/ColorPaletteField"
import { productColorProps } from "../../dev-center-product"
import type { CentralForm } from "./form"

/** Cor do projeto nos cards da Central de desenvolvimento e em Tarefas (seletor de cores com as favoritas ou neutra), com prévia. */
export function CentralColorField({ form, label }: { form: CentralForm; label: string }) {
    const color = useWatch({ control: form.control, name: "color" })
    const preview = productColorProps(color)
    return (
        <div className="space-y-1.5">
            <p id="central-color" className="text-sm font-medium">
                Cor do projeto
            </p>
            <Controller
                control={form.control}
                name="color"
                render={({ field, fieldState }) => (
                    <>
                        <ColorPaletteField id="central-color-picker" aria-labelledby="central-color" value={normalizeColor(field.value)} onChange={field.onChange} allowNone noneLabel="Sem cor (neutra)" />
                        {fieldState.error?.message && (
                            <p role="alert" className="text-xs text-destructive">
                                {fieldState.error.message}
                            </p>
                        )}
                    </>
                )}
            />
            <p className="text-xs text-muted-foreground">
                Nos cards da Central de desenvolvimento, acima do título, e em Tarefas:{" "}
                <span data-testid="central-color-preview" className={cn("font-bold", preview.className)} style={preview.style}>
                    {label}
                </span>
            </p>
        </div>
    )
}
