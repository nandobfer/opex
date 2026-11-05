"use client"

import { Controller, type UseFormReturn } from "react-hook-form"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { DEFAULT_LIVE_WAIT_MINUTES } from "../../constants"
import type { RoutineAgentInput, RoutineLimits } from "../../schemas"

/**
 * Limites (todos opcionais; vazio = sem limite). Decisão D1 da OPE-130: no lugar do custo máximo, o
 * **máximo de tokens por execução** (os provedores diretos não informam custo).
 */
const FIELDS: { key: keyof RoutineLimits; label: string; placeholder: string; hint: string }[] = [
    { key: "concurrency", label: "Execuções simultâneas", placeholder: "Sem limite", hint: "Executando e Esperando ocupam vaga; a fila anda por ordem de chegada." },
    { key: "maxActiveMinutes", label: "Tempo máximo de execução ativa (min)", placeholder: "Sem limite", hint: "Executando + Esperando. Estourou → Erro." },
    { key: "maxWaitingMinutes", label: "Tempo máximo total esperando (min)", placeholder: "Sem limite", hint: "Hibernada ou aguardando confirmação. Estourou → Expirada." },
    { key: "maxTokens", label: "Máximo de tokens por execução", placeholder: "Sem limite", hint: "Conferido a cada passo. Estourou → Erro \"Limite de tokens atingido\"." },
    { key: "maxLiveWaitMinutes", label: "Espera viva máxima (min)", placeholder: `${DEFAULT_LIVE_WAIT_MINUTES} (padrão)`, hint: "Somada por turno; estourou → hiberna e reverifica em 1 min." },
]

export function RoutineLimitsFields({ form }: { form: UseFormReturn<RoutineAgentInput> }) {
    const errors = form.formState.errors.limits
    return (
        <div className={FORM_GRID}>
            {FIELDS.map((item) => (
                <Field key={item.key} id={`routine-limit-${item.key}`} label={item.label} error={errors?.[item.key]?.message}>
                    <Controller
                        control={form.control}
                        name={`limits.${item.key}`}
                        render={({ field }) => (
                            <Input
                                id={`routine-limit-${item.key}`}
                                type="number"
                                min={1}
                                inputMode="numeric"
                                placeholder={item.placeholder}
                                value={field.value ?? ""}
                                onChange={(event) => field.onChange(event.target.value === "" ? null : Number(event.target.value))}
                            />
                        )}
                    />
                    <p className="text-[11px] text-muted-foreground">{item.hint}</p>
                </Field>
            ))}
        </div>
    )
}
