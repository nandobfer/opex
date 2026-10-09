"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { formatNumberBR, parseBankingInputBR } from "@/lib/format"
import { cn } from "@/lib/utils"

interface MoneyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
    value: number | null | undefined
    onChange: (value: number) => void
    /** Prefixo à esquerda (padrão: R$). */
    prefix?: string
    decimals?: number
}

/**
 * Campo monetário com digitação "bancária" — cópia do campo de valor do formulário de proposta do
 * Smart Desk (`MarketProposalDialog`): prefixo "R$", `formatNumberBR` na exibição e
 * `parseBankingInputBR` na digitação (os dígitos entram pelos centavos).
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(({ value, onChange, prefix = "R$", decimals = 2, className, ...props }, ref) => (
    <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span>
        <Input
            ref={ref}
            type="text"
            inputMode="decimal"
            value={formatNumberBR(value || 0, decimals)}
            onChange={(event) => onChange(parseBankingInputBR(event.target.value, decimals))}
            className={cn("pl-10 font-mono", className)}
            {...props}
        />
    </div>
))
MoneyInput.displayName = "MoneyInput"
