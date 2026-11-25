"use client"

import type { ReactNode } from "react"
import type { Control, FieldValues, Path } from "react-hook-form"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { FormNumberInput } from "@/components/ui/number-field"
import { cn } from "@/lib/utils"
import type { HostCapacityDto } from "../types"

type LimitKey = "memoryGb" | "swapGb" | "cpus"

const gib = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })

/**
 * RAM, swap além da RAM e CPUs (vazio = sem limite), com as ajudas do builder do servidor. `prefix` é o
 * caminho do objeto dos limites no formulário (ex.: `"limits."` ou `"limits.services.0."`; vazio = raiz).
 * `host` é a máquina onde os limites valem (`machine` dá o nome na ajuda). `leading` entra na mesma grade,
 * antes dos limites (ex.: o nome do builder); `grid` troca a grade (padrão `FORM_GRID`).
 */
export function ResourceLimitsFields<T extends FieldValues>({
    control,
    prefix = "",
    idPrefix,
    errors,
    host,
    machine = "o servidor",
    leading,
    grid = FORM_GRID,
    className,
}: {
    control: Control<T>
    prefix?: string
    idPrefix: string
    errors?: Partial<Record<LimitKey, { message?: string } | undefined>>
    host: HostCapacityDto | null
    machine?: string
    leading?: ReactNode
    grid?: string
    className?: string
}) {
    const name = (key: LimitKey) => `${prefix}${key}` as Path<T>
    return (
        <div className={cn(grid, className)}>
            {leading}
            <Field id={`${idPrefix}-memory`} label="RAM máxima (GiB)" error={errors?.memoryGb?.message}>
                <FormNumberInput control={control} name={name("memoryGb")} id={`${idPrefix}-memory`} nullable step={0.5} min={0.5} max={host?.memoryGb} placeholder="Sem limite" />
                <p className="text-xs text-muted-foreground">Vazio = sem limite{host ? `; ${machine} tem ${gib(host.memoryGb)} GiB` : ""}</p>
            </Field>
            <Field id={`${idPrefix}-swap`} label="Swap além da RAM (GiB)" error={errors?.swapGb?.message}>
                <FormNumberInput control={control} name={name("swapGb")} id={`${idPrefix}-swap`} nullable step={0.5} min={0} placeholder="Padrão do Docker" />
                <p className="text-xs text-muted-foreground">Vazio = padrão do Docker (igual à RAM); 0 = sem swap. Exige a RAM</p>
            </Field>
            <Field id={`${idPrefix}-cpus`} label="CPUs" error={errors?.cpus?.message}>
                <FormNumberInput control={control} name={name("cpus")} id={`${idPrefix}-cpus`} nullable step={0.5} min={0.1} max={host?.cpus} placeholder="Sem limite" />
                <p className="text-xs text-muted-foreground">Vazio = sem limite; aceita fração (ex.: 2.5){host ? `; ${machine} tem ${host.cpus}` : ""}</p>
            </Field>
        </div>
    )
}
