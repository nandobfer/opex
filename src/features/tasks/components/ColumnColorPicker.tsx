"use client"

import { motion } from "framer-motion"
import { Ban, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { COLUMN_COLOR_STYLES, COLUMN_COLORS, type ColumnColor } from "../board"

const SWATCH = "flex h-7 w-7 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-shadow"
const NONE_SWATCH = "border border-border bg-muted"

type ColumnColorPickerProps = { "aria-label"?: string; "aria-labelledby"?: string } & (
    | { allowNone?: false; value: ColumnColor; onChange: (value: ColumnColor) => void }
    | { allowNone: true; value: ColumnColor | null; onChange: (value: ColumnColor | null) => void }
)

/**
 * Paleta das colunas do quadro em bolinhas (radiogroup). Usada pela cor da coluna de Tarefas e pela
 * cor do projeto na central de desenvolvimento; com `allowNone`, a primeira opção é "Sem cor (neutra)".
 */
export function ColumnColorPicker(props: ColumnColorPickerProps) {
    const options: { value: ColumnColor | null; label: string; swatch: string }[] = [
        ...(props.allowNone ? [{ value: null, label: "Sem cor (neutra)", swatch: NONE_SWATCH }] : []),
        ...COLUMN_COLORS.map((value) => ({ value, label: COLUMN_COLOR_STYLES[value].label, swatch: COLUMN_COLOR_STYLES[value].swatch })),
    ]
    const select = (value: ColumnColor | null) => {
        if (props.allowNone) props.onChange(value)
        else if (value) props.onChange(value)
    }
    return (
        <div role="radiogroup" aria-label={props["aria-label"]} aria-labelledby={props["aria-labelledby"]} className="flex flex-wrap gap-2">
            {options.map((option) => {
                const checked = (props.value ?? null) === option.value
                return (
                    <motion.button
                        key={option.value ?? "none"}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        aria-label={option.label}
                        title={option.label}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => select(option.value)}
                        className={cn(SWATCH, option.swatch, checked && "ring-2 ring-foreground")}
                    >
                        {checked ? <Check className={cn("h-3.5 w-3.5", option.value ? "text-white" : "text-foreground")} aria-hidden /> : !option.value && <Ban className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
                    </motion.button>
                )
            })}
        </div>
    )
}
