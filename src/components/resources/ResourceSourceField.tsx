"use client"

import type { UseFormRegisterReturn } from "react-hook-form"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

/** Campo da origem de uma instalação (repositório/pacote), em fonte mono (OPE-153, extraído da instalação do OpenCode). */
export function ResourceSourceField({ id, label, placeholder, error, registration, disabled }: { id: string; label: string; placeholder: string; error?: string; registration: UseFormRegisterReturn; disabled?: boolean }) {
    return (
        <Field id={id} label={label} error={error}>
            <Input id={id} className="font-mono" placeholder={placeholder} autoFocus disabled={disabled} {...registration} />
        </Field>
    )
}
