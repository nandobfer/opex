"use client"

import { cn } from "@/lib/utils"
import { Slider } from "@/components/ui/slider"

/**
 * Slider em degraus com rótulo em texto em cada marca (ex.: criticidade do Agente Adversário,
 * profundidade do Agente Arquiteto). `levels` é a lista ordenada de valores; o slider anda pelos índices.
 */
export function LeveledSlider<T extends string | number>({
    id,
    label,
    levels,
    value,
    onChange,
    onBlur,
    labelOf,
    disabled,
    className,
}: {
    id: string
    label: string
    levels: readonly T[]
    value: T
    onChange: (next: T) => void
    onBlur?: () => void
    labelOf: (level: T) => string
    disabled?: boolean
    className?: string
}) {
    const index = Math.max(0, levels.indexOf(value))
    const marks = levels.map((level, position) => ({ value: position, label: labelOf(level) }))
    return (
        <div className={cn("px-7 pb-2", className)}>
            <Slider
                id={id}
                aria-label={label}
                min={0}
                max={levels.length - 1}
                step={1}
                value={index}
                disabled={disabled}
                onChange={(next) => onChange(levels[next] ?? value)}
                onBlur={onBlur}
                formatValue={(position) => labelOf(levels[position] ?? value)}
                marks={marks}
            />
        </div>
    )
}
