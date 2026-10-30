"use client"

import { Controller, useWatch } from "react-hook-form"
import { cn } from "@/lib/utils"
import { ColumnColorPicker } from "@/features/tasks/components/ColumnColorPicker"
import { productColorClass } from "../../dev-center-product"
import type { CentralForm } from "./form"

/** Cor do projeto nos cards da Central de desenvolvimento e em Tarefas (paleta das colunas ou neutra), com prévia. */
export function CentralColorField({ form, label }: { form: CentralForm; label: string }) {
    const color = useWatch({ control: form.control, name: "color" })
    return (
        <div className="space-y-1.5">
            <p id="central-color" className="text-sm font-medium">
                Cor do projeto
            </p>
            <Controller control={form.control} name="color" render={({ field }) => <ColumnColorPicker allowNone aria-labelledby="central-color" value={field.value ?? null} onChange={field.onChange} />} />
            <p className="text-xs text-muted-foreground">
                Nos cards da Central de desenvolvimento, acima do título, e em Tarefas:{" "}
                <span data-testid="central-color-preview" className={cn("font-bold", productColorClass(color))}>
                    {label}
                </span>
            </p>
        </div>
    )
}
