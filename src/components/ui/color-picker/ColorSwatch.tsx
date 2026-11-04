"use client"

import { motion } from "framer-motion"
import { Check } from "lucide-react"
import { readableTextOn } from "@/lib/colors"
import { cn } from "@/lib/utils"

interface ColorSwatchProps {
    color: string
    label: string
    checked: boolean
    onSelect: (color: string) => void
    size?: "sm" | "md"
}

/** Amostra clicável (rádio) do seletor de cores. A cor vem do usuário, daí o `style` inline. */
export function ColorSwatch({ color, label, checked, onSelect, size = "sm" }: ColorSwatchProps) {
    return (
        <motion.button
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={label}
            title={label}
            data-color={color}
            whileTap={{ scale: 0.9 }}
            onClick={() => onSelect(color)}
            style={{ backgroundColor: color }}
            className={cn(
                "flex shrink-0 items-center justify-center rounded-md ring-offset-2 ring-offset-popover transition-shadow hover:ring-2 hover:ring-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                size === "sm" ? "h-6 w-6" : "h-7 w-7",
                checked && "ring-2 ring-foreground hover:ring-foreground",
            )}
        >
            {checked && <Check className={cn("h-3.5 w-3.5", readableTextOn(color) === "dark" ? "text-background" : "text-foreground")} aria-hidden />}
        </motion.button>
    )
}
