"use client"

import { Controller, type Control, type FieldPath } from "react-hook-form"
import { Input } from "@/components/ui/input"
import type { LocalDockerSettings } from "../schemas"

type NumberPath = Extract<FieldPath<LocalDockerSettings>, "pcSshPort" | "controlPort" | "builderMemoryGb" | "builderCpus" | "builderCacheKeepGb" | `aliases.${number}.port`>

/** Campo numérico do formulário: vazio vira `null` (`nullable`) ou `NaN` (obrigatório, a validação acusa). */
export function NumberField({ control, name, id, nullable, step = 1, placeholder }: { control: Control<LocalDockerSettings>; name: NumberPath; id: string; nullable?: boolean; step?: number; placeholder?: string }) {
    return (
        <Controller
            control={control}
            name={name}
            render={({ field }) => {
                const value = field.value as number | null
                return (
                    <Input
                        id={id}
                        type="number"
                        step={step}
                        placeholder={placeholder}
                        value={value === null || Number.isNaN(value) ? "" : value}
                        onChange={(event) => {
                            const raw = event.target.value.trim()
                            field.onChange(raw === "" ? (nullable ? null : Number.NaN) : Number(raw))
                        }}
                    />
                )
            }}
        />
    )
}
