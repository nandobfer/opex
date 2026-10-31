"use client"

import { Input } from "@/components/ui/input"

interface TemperatureInputProps {
    id: string
    value: number | null | undefined
    onChange: (value: number | null) => void
    disabled?: boolean
    "aria-invalid"?: boolean
}

/** Converte o texto do campo: vazio vira `null` (padrão do modelo). */
export const temperatureFromText = (text: string): number | null => (text.trim() === "" ? null : Number(text))

/** Campo de temperatura das telas de IA: 0 a 2, passo 0,1; vazio = padrão do modelo (`null`). */
export function TemperatureInput({ id, value, onChange, disabled, ...rest }: TemperatureInputProps) {
    return <Input id={id} type="number" step="0.1" min={0} max={2} placeholder="Padrão do modelo" value={value ?? ""} disabled={disabled} aria-invalid={rest["aria-invalid"]} onChange={(event) => onChange(temperatureFromText(event.target.value))} />
}
