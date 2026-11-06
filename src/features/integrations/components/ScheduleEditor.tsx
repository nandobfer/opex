"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TimePicker } from "@/components/ui/time-picker"
import { cn } from "@/lib/utils"
import {
    describeSchedule,
    isSecondsSchedule,
    MIN_INTERVAL_SECONDS,
    SCHEDULE_TYPE_LABELS,
    validateSchedule,
    WEEKDAY_SHORT_LABELS,
    type Schedule,
    type ScheduleType,
} from "@/lib/integrations/schedule"

interface ScheduleEditorProps {
    value: Schedule
    onChange: (value: Schedule) => void
    disabled?: boolean
    /**
     * Regra extra do destino (ex.: o cron UTC do Engramind, OPE-117): a mensagem aparece no lugar da
     * descrição, como os erros do próprio agendamento. As Rotinas não passam (sem restrição a mais).
     */
    validate?: (value: Schedule) => string | null
    /** Oferece a unidade "segundos" no intervalo (só Integrações › Crons; mínimo de 10 s). */
    allowSeconds?: boolean
}

type IntervalUnit = "seconds" | "minutes" | "hours"

/** Unidade em que o intervalo é exibido: segundos, horas (múltiplo de 60 min) ou minutos. */
export function intervalUnitOf(value: Schedule): IntervalUnit {
    if (isSecondsSchedule(value)) return "seconds"
    return value.type === "interval" && value.minutes % 60 === 0 ? "hours" : "minutes"
}

/** Quantidade exibida no campo do intervalo, na unidade atual. */
function intervalAmount(value: Schedule, unit: IntervalUnit): number {
    if (value.type !== "interval") return 1
    if (isSecondsSchedule(value)) return value.seconds
    return unit === "hours" ? value.minutes / 60 : value.minutes
}

/** Monta o intervalo a partir da quantidade e da unidade (segundos com o mínimo do tick rápido). */
export function buildInterval(amount: number, unit: IntervalUnit): Schedule {
    const n = Math.max(1, Math.round(amount))
    if (unit === "seconds") return { type: "interval", seconds: Math.max(MIN_INTERVAL_SECONDS, n) }
    return { type: "interval", minutes: unit === "hours" ? n * 60 : n }
}

/** Troca de tipo preservando o horário já escolhido, quando houver. */
export function switchScheduleType(current: Schedule, type: ScheduleType): Schedule {
    const time = "time" in current ? current.time : "08:00"
    switch (type) {
        case "interval":
            return current.type === "interval" ? current : { type, minutes: 60 }
        case "daily":
            return { type, time }
        case "weekly":
            return { type, days: current.type === "weekly" ? current.days : [1, 2, 3, 4, 5], time }
        case "monthly":
            return { type, day: current.type === "monthly" ? current.day : 1, time }
    }
}

/** Controle da linha de agendamento: ocupa a largura disponível, dividida com os vizinhos. */
export const CONTROL = "w-full min-w-0 sm:flex-1"
const CONNECTOR = "shrink-0 text-sm text-muted-foreground"

const fieldMotion = {
    initial: { opacity: 0, height: 0 },
    animate: { opacity: 1, height: "auto" },
    exit: { opacity: 0, height: 0 },
    transition: { duration: 0.2, ease: "easeOut" },
} as const

/** Editor amigável de agendamento — sem expressão cron. Horários em Brasília. */
export function ScheduleEditor({ value, onChange, disabled, validate, allowSeconds = false }: ScheduleEditorProps) {
    const error = validateSchedule(value) ?? validate?.(value) ?? null
    const intervalUnit = intervalUnitOf(value)

    return (
        <div className="space-y-3">
            {/* Controles dividem a linha em partes iguais; conectores ("às", "no dia") só o tamanho do texto. */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center" data-testid="schedule-row">
                <Select value={value.type} onValueChange={(type) => onChange(switchScheduleType(value, type as ScheduleType))} disabled={disabled}>
                    <SelectTrigger className={CONTROL} aria-label="Frequência">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {(Object.keys(SCHEDULE_TYPE_LABELS) as ScheduleType[]).map((type) => (
                            <SelectItem key={type} value={type}>
                                {SCHEDULE_TYPE_LABELS[type]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {value.type === "interval" && (
                    <>
                        <Input
                            type="number"
                            min={intervalUnit === "seconds" ? MIN_INTERVAL_SECONDS : 1}
                            className={CONTROL}
                            aria-label="Intervalo"
                            value={intervalAmount(value, intervalUnit)}
                            onChange={(event) => onChange(buildInterval(Math.floor(Number(event.target.value) || 1), intervalUnit))}
                            disabled={disabled}
                        />
                        <Select
                            value={intervalUnit}
                            onValueChange={(unit) => onChange(buildInterval(intervalAmount(value, intervalUnit), unit as IntervalUnit))}
                            disabled={disabled}
                        >
                            <SelectTrigger className={CONTROL} aria-label="Unidade">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(allowSeconds || intervalUnit === "seconds") && <SelectItem value="seconds">segundos</SelectItem>}
                                <SelectItem value="minutes">minutos</SelectItem>
                                <SelectItem value="hours">horas</SelectItem>
                            </SelectContent>
                        </Select>
                    </>
                )}

                {value.type === "monthly" && (
                    <>
                        <span className={CONNECTOR}>no dia</span>
                        <Input
                            type="number"
                            min={1}
                            max={31}
                            className={CONTROL}
                            aria-label="Dia do mês"
                            value={value.day}
                            onChange={(event) =>
                                onChange({ ...value, day: Math.min(31, Math.max(1, Math.floor(Number(event.target.value) || 1))) })
                            }
                            disabled={disabled}
                        />
                    </>
                )}

                {"time" in value && (
                    <>
                        <span className={CONNECTOR}>às</span>
                        <TimePicker
                            className={CONTROL}
                            aria-label="Horário"
                            value={value.time}
                            onChange={(time) => onChange({ ...value, time })}
                            disabled={disabled}
                        />
                    </>
                )}
            </div>

            <AnimatePresence initial={false}>
                {value.type === "weekly" && (
                    <motion.div {...fieldMotion} className="overflow-hidden">
                        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Dias da semana">
                            {WEEKDAY_SHORT_LABELS.map((label, day) => {
                                const active = value.days.includes(day)
                                return (
                                    <motion.button
                                        key={label}
                                        type="button"
                                        whileTap={{ scale: 0.92 }}
                                        aria-pressed={active}
                                        disabled={disabled}
                                        onClick={() =>
                                            onChange({
                                                ...value,
                                                days: active ? value.days.filter((d) => d !== day) : [...value.days, day].sort((a, b) => a - b),
                                            })
                                        }
                                        className={cn(
                                            "h-8 min-w-11 rounded-full border px-3 text-xs font-medium transition-colors",
                                            active ? "border-primary bg-primary text-white" : "bg-background hover:bg-muted",
                                        )}
                                    >
                                        {label}
                                    </motion.button>
                                )
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence mode="wait" initial={false}>
                <motion.p
                    key={error ?? describeSchedule(value)}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}
                >
                    {error ?? `${describeSchedule(value)} (horário de Brasília)`}
                </motion.p>
            </AnimatePresence>
        </div>
    )
}
