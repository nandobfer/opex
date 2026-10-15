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
 * selecionado (`computeServiceAmounts`). As horas usam o mesmo `hh:mm` do campo de estimativa da
 * tarefa (`estimate-duration`): enquanto a digitação não fecha o formato, os derivados ficam como
 * estão; ao sair do campo o texto é normalizado com o valor confirmado.
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

    /** Texto formatado de um campo a partir do valor já confirmado (usado no blur). */
    const committed = (field: ServiceCalcOrigin) => {
        if (field === "billingBrl") return formatMoneyInput(value.billingBrl)
        return formatHoursInput(field === "hours" ? value.hours : value.clientHours)
    }

    const handle = (field: ServiceCalcOrigin, text: string) => {
        setRaw((prev) => ({ ...prev, [field]: text }))
        const parsed = field === "billingBrl" ? parseMoneyInput(text) : parseHoursInput(text)
        // Campo ainda incompleto (ex.: "1:"): não recalcula nem sobrescreve os derivados.
        if (parsed === null && text.trim() !== "") return
        const base = {
            origin: field,
            hours: field === "hours" ? (parsed ?? 0) : value.hours,
            clientHours: field === "clientHours" ? (parsed ?? 0) : value.clientHours,
            billingBrl: field === "billingBrl" ? (parsed ?? 0) : value.billingBrl,
        }
        const amounts = computeServiceAmounts({ ...base, factor, hourlyRate })
        const next: ServiceAmountValues = { origin: field, hours: amounts.hours, clientHours: amounts.clientHours, billingBrl: amounts.billingBrl }
        lastEmitted.current = next
        // Preserva o texto em edição; reformata só os derivados.
        setRaw((prev) => ({
            hours: field === "hours" ? prev.hours : formatHoursInput(amounts.hours),
            clientHours: field === "clientHours" ? prev.clientHours : formatHoursInput(amounts.clientHours),
            billingBrl: field === "billingBrl" ? prev.billingBrl : formatMoneyInput(amounts.billingBrl),
        }))
        onChange(next)
    }

    /** Ao sair do campo, normaliza o texto com o valor confirmado (descarta digitação incompleta). */
    const blur = (field: ServiceCalcOrigin) => setRaw((prev) => ({ ...prev, [field]: committed(field) }))

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
