"use client"

import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Switch } from "@/components/ui/switch"
import { TimePicker } from "@/components/ui/time-picker"
import type { RoutineAgentInput, RoutineTrigger, RoutineTriggerKind } from "../../schemas"

const KIND_OPTIONS: { value: RoutineTriggerKind; label: string }[] = [
    { value: "interval", label: "A cada" },
    { value: "daily", label: "Diário" },
    { value: "weekly", label: "Dias da semana" },
    { value: "once", label: "Único" },
    { value: "webhook", label: "Webhook" },
]
const UNIT_OPTIONS = [
    { value: "minutes" as const, label: "Minutos" },
    { value: "hours" as const, label: "Horas" },
]
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

/** Gatilho com outro tipo: mantém id e ligado, troca os campos do tipo. */
export function triggerOfKind(current: Pick<RoutineTrigger, "id" | "enabled">, kind: RoutineTriggerKind): RoutineTrigger {
    const base = { id: current.id, enabled: current.enabled }
    if (kind === "interval") return { ...base, kind, every: 60, unit: "minutes" }
    if (kind === "daily") return { ...base, kind, time: "08:00" }
    if (kind === "weekly") return { ...base, kind, days: [1, 2, 3, 4, 5], time: "08:00" }
    if (kind === "once") return { ...base, kind, at: "" }
    return { ...base, kind }
}

/** Um gatilho (sempre no horário de Brasília). */
export function RoutineTriggerRow({ form, index, onRemove, webhookUrl }: { form: UseFormReturn<RoutineAgentInput>; index: number; onRemove: () => void; webhookUrl: string | null }) {
    const trigger = useWatch({ control: form.control, name: `triggers.${index}` })
    const errors = form.formState.errors.triggers?.[index] as Record<string, { message?: string } | undefined> | undefined
    if (!trigger) return null
    const setTrigger = (next: RoutineTrigger) => form.setValue(`triggers.${index}`, next, { shouldDirty: true, shouldValidate: true })
    const prefix = `routine-trigger-${index}`
    return (
        <div className="space-y-3 rounded-lg border p-3" data-testid={prefix}>
            <div className="flex items-center gap-2">
                <OptionTabs<RoutineTriggerKind> id={`${prefix}-kind`} aria-label="Tipo do gatilho" className="flex-1" options={KIND_OPTIONS} value={trigger.kind} onChange={(kind) => setTrigger(triggerOfKind(trigger, kind))} />
                <Controller control={form.control} name={`triggers.${index}.enabled`} render={({ field }) => <Switch aria-label="Gatilho ligado" checked={field.value} onCheckedChange={field.onChange} />} />
                <Button type="button" variant="ghost" size="icon" aria-label="Remover gatilho" onClick={onRemove}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
            </div>
            {trigger.kind === "interval" && (
                <div className={FORM_GRID}>
                    <Field id={`${prefix}-every`} label="Intervalo" error={errors?.every?.message}>
                        <Input id={`${prefix}-every`} type="number" min={1} value={trigger.every} onChange={(event) => setTrigger({ ...trigger, every: Number(event.target.value) })} />
                    </Field>
                    <Field id={`${prefix}-unit`} label="Unidade">
                        <OptionTabs id={`${prefix}-unit`} aria-label="Unidade" className="w-full" options={UNIT_OPTIONS} value={trigger.unit} onChange={(unit) => setTrigger({ ...trigger, unit })} />
                    </Field>
                </div>
            )}
            {(trigger.kind === "daily" || trigger.kind === "weekly") && (
                <div className={FORM_GRID}>
                    {trigger.kind === "weekly" && (
                        <Field id={`${prefix}-days`} label="Dias" error={errors?.days?.message}>
                            <div className="flex flex-wrap gap-1" id={`${prefix}-days`}>
                                {WEEKDAYS.map((label, day) => {
                                    const active = trigger.days.includes(day)
                                    return (
                                        <Button key={label} type="button" size="sm" variant={active ? "default" : "outline"} aria-pressed={active} onClick={() => setTrigger({ ...trigger, days: active ? trigger.days.filter((item) => item !== day) : [...trigger.days, day].sort() })}>
                                            {label}
                                        </Button>
                                    )
                                })}
                            </div>
                        </Field>
                    )}
                    <Field id={`${prefix}-time`} label="Horário (Brasília)" error={errors?.time?.message}>
                        <TimePicker id={`${prefix}-time`} step={5} value={trigger.time} onChange={(time) => setTrigger({ ...trigger, time })} aria-label="Horário" className="w-full" />
                    </Field>
                </div>
            )}
            {trigger.kind === "once" && (
                <div className={FORM_GRID}>
                    <Field id={`${prefix}-date`} label="Data" error={errors?.at?.message}>
                        <DatePicker id={`${prefix}-date`} value={trigger.at.slice(0, 10)} onChange={(date) => setTrigger({ ...trigger, at: `${date}T${trigger.at.slice(11, 16) || "08:00"}` })} className="w-full" />
                    </Field>
                    <Field id={`${prefix}-hour`} label="Horário (Brasília)">
                        <TimePicker id={`${prefix}-hour`} step={5} value={trigger.at.slice(11, 16)} onChange={(time) => setTrigger({ ...trigger, at: `${trigger.at.slice(0, 10)}T${time}` })} aria-label="Horário" className="w-full" />
                    </Field>
                </div>
            )}
            {trigger.kind === "webhook" && (
                <p className="text-xs text-muted-foreground">
                    {webhookUrl ? (
                        <>
                            <code className="break-all">POST {webhookUrl}</code> com um token de sistema com o escopo <code>api:v1:routine-agents</code> (Integrações › API interna). Desligado, responde 409.
                        </>
                    ) : (
                        "A URL do webhook aparece depois de criar o agente."
                    )}
                </p>
            )}
        </div>
    )
}
