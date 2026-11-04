"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { HEX_COLOR_MESSAGE, parseHexColor } from "@/lib/colors"

interface HexColorInputProps {
    id: string
    value: string | null
    onChange: (color: string) => void
}

/**
 * Campo do código hexadecimal: aplica a cor assim que o código fica válido e rejeita o inválido com
 * a mensagem pt-BR (no Enter, ao sair do campo ou com o código completo).
 */
export function HexColorInput({ id, value, onChange }: HexColorInputProps) {
    const [text, setText] = useState(value ?? "")
    const [touched, setTouched] = useState(false)
    const [synced, setSynced] = useState(value)

    // A cor mudou por fora (grade, favorita): o campo passa a mostrar o novo hex.
    if (synced !== value) {
        setSynced(value)
        setText(value ?? "")
        setTouched(false)
    }

    const parsed = parseHexColor(text)
    const invalid = text.trim() !== "" && !parsed && (touched || text.trim().length >= 7)

    return (
        <div className="space-y-1">
            <label htmlFor={id} className="text-xs font-semibold">
                Hexadecimal
            </label>
            <div className="flex items-center gap-2">
                <span className="h-8 w-8 shrink-0 rounded-md border" style={parsed ? { backgroundColor: parsed } : undefined} aria-hidden />
                <Input
                    id={id}
                    value={text}
                    placeholder="#8000FF"
                    maxLength={7}
                    spellCheck={false}
                    autoComplete="off"
                    className="h-8 font-mono uppercase"
                    aria-invalid={invalid || undefined}
                    aria-describedby={invalid ? `${id}-error` : undefined}
                    onChange={(event) => {
                        const next = event.target.value
                        setText(next)
                        const hex = parseHexColor(next)
                        if (hex && next.trim().replace("#", "").length === 6 && hex !== value) onChange(hex)
                    }}
                    onBlur={() => setTouched(true)}
                    onKeyDown={(event) => {
                        if (event.key !== "Enter") return
                        event.preventDefault()
                        setTouched(true)
                        if (parsed) onChange(parsed)
                    }}
                />
            </div>
            {invalid && (
                <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
                    {HEX_COLOR_MESSAGE}
                </p>
            )}
        </div>
    )
}
