"use client"

import { useEffect, useRef, useState } from "react"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { FORM_GRID_3 } from "@/components/ui/form-grid"
import { SERVICE_CALC_ORIGINS } from "../constants"
import { computeServiceAmounts, formatHoursInput, formatMoneyInput, parseHoursInput, parseMoneyInput } from "../logic"
import type { ServiceCalcOrigin } from "../constants"

/**
 * Os três campos reativos do serviço (duração real, duração inflada e faturamento). O **último campo
 * editado** manda: os outros dois são recalculados com o fator de lucro e o custo/hora do cliente
 * selecionado (`computeServiceAmounts`). Enquanto se digita, o campo em edição mantém o texto cru; os
 * derivados são reformatados (`H:mm` / `R$`).
 */

export interface ServiceAmountValues {
    origin: ServiceCalcOrigin
    hours: number
    clientHours: number
    billingBrl: number
}

interface ServiceAmountsFieldsProps {
    factor: number
    hourlyRate: number
    value: ServiceAmountValues
    onChange: (value: ServiceAmountValues) => void
    disabled?: boolean
}

const toRaw = (value: ServiceAmountValues) => ({
    hours: formatHoursInput(value.hours),
    clientHours: formatHoursInput(value.clientHours),
    billingBrl: formatMoneyInput(value.billingBrl),
})

const sameNumbers = (a: ServiceAmountValues, b: ServiceAmountValues) => a.hours === b.hours && a.clientHours === b.clientHours && a.billingBrl === b.billingBrl

export function ServiceAmountsFields({ factor, hourlyRate, value, onChange, disabled }: ServiceAmountsFieldsProps) {
    const [raw, setRaw] = useState(() => toRaw(value))
    const lastEmitted = useRef(value)

    // Recalculado fora (troca de cliente, carga inicial): re-sincroniza o texto.
    useEffect(() => {
        if (sameNumbers(value, lastEmitted.current)) return
        lastEmitted.current = value
        setRaw(toRaw(value))
    }, [value])

    const numberFrom = (field: keyof typeof raw) => {
        const parsed = field === "billingBrl" ? parseMoneyInput(raw[field]) : parseHoursInput(raw[field])
        return parsed ?? 0
    }

    const handle = (field: ServiceCalcOrigin, text: string) => {
        setRaw((prev) => ({ ...prev, [field]: text }))
        const parsed = field === "billingBrl" ? parseMoneyInput(text) : parseHoursInput(text)
        const base = {
            origin: field,
            hours: field === "hours" ? (parsed ?? 0) : numberFrom("hours"),
            clientHours: field === "clientHours" ? (parsed ?? 0) : numberFrom("clientHours"),
            billingBrl: field === "billingBrl" ? (parsed ?? 0) : numberFrom("billingBrl"),
        }
        const amounts = computeServiceAmounts({ ...base, factor, hourlyRate })
        const next: ServiceAmountValues = { origin: field, hours: amounts.hours, clientHours: amounts.clientHours, billingBrl: amounts.billingBrl }
        lastEmitted.current = next
        // Preserva o texto em edição; reformata só os derivados.
        setRaw((prev) => ({ hours: field === "hours" ? prev.hours : formatHoursInput(amounts.hours), clientHours: field === "clientHours" ? prev.clientHours : formatHoursInput(amounts.clientHours), billingBrl: field === "billingBrl" ? prev.billingBrl : formatMoneyInput(amounts.billingBrl) }))
        onChange(next)
    }

    const blur = (field: keyof typeof raw) => {
        const parsed = field === "billingBrl" ? parseMoneyInput(raw[field]) : parseHoursInput(raw[field])
        setRaw((prev) => ({ ...prev, [field]: field === "billingBrl" ? formatMoneyInput(parsed ?? 0) : formatHoursInput(parsed ?? 0) }))
    }

    const fields = SERVICE_CALC_ORIGINS.map((origin) => ({ origin, ...labels[origin] }))

    return (
        <div className={FORM_GRID_3}>
            {fields.map((field) => (
                <Field key={field.origin} id={`service-${field.origin}`} label={field.label}>
                    <Input
                        id={`service-${field.origin}`}
                        value={raw[field.origin]}
                        onChange={(event) => handle(field.origin, event.target.value)}
                        onBlur={() => blur(field.origin)}
                        inputMode="decimal"
                        placeholder={field.placeholder}
                        disabled={disabled}
                        aria-label={field.label}
                    />
                </Field>
            ))}
        </div>
    )
}

const labels: Record<ServiceCalcOrigin, { label: string; placeholder: string }> = {
    hours: { label: "Duração do serviço", placeholder: "0:00" },
    clientHours: { label: "Duração inflada", placeholder: "0:00" },
    billingBrl: { label: "Faturamento (R$)", placeholder: "0,00" },
}
