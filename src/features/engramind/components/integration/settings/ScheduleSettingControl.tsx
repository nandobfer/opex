"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Input } from "@/components/ui/input"
import { OptionTabs } from "@/components/ui/option-tabs"
import type { Schedule } from "@/lib/integrations/schedule"
import { ScheduleEditor } from "@/features/integrations/components/ScheduleEditor"
import { invalidScheduleMarker, scheduleToUtcCron, utcCronToSchedule, validateCron } from "../../../schedule-cron"
import { formatDateTime } from "../../shared/format"

type Mode = "schedule" | "cron"

const MODES: { value: Mode; label: string }[] = [
    { value: "schedule", label: "Agendamento" },
    { value: "cron", label: "Expressão cron" },
]

const DEFAULT_SCHEDULE: Schedule = { type: "daily", time: "00:00" }

const fade = { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 }, transition: { duration: 0.15 } } as const

/**
 * Controle do `consolidation.schedule` (cron de 5 campos em UTC no Engramind, OPE-117): o mesmo editor
 * das Rotinas (horário de Brasília), convertido para o cron UTC; o modo "Expressão cron" edita à mão.
 * Um cron que não cabe no editor abre direto no modo avançado.
 */
export function ScheduleSettingControl({ id, value, onChange, disabled, nextRunAt }: { id: string; value: unknown; onChange: (value: unknown) => void; disabled?: boolean; nextRunAt?: string | null }) {
    const expression = typeof value === "string" ? value : ""
    const modeOf = (cron: string): Mode => (utcCronToSchedule(cron) ? "schedule" : "cron")
    const [mode, setMode] = useState<Mode>(() => modeOf(expression))
    // O que este controle gravou por último (cron ou marcador de inválido) e o agendamento que o gerou.
    const [emitted, setEmitted] = useState<{ value: string; schedule: Schedule | null } | null>(null)
    // O rascunho mudou por fora (Voltar ao padrão, Desfazer, configuração nova): o editor segue o valor.
    const [seen, setSeen] = useState(expression)
    if (seen !== expression) {
        setSeen(expression)
        if (emitted?.value !== expression) {
            setEmitted(null)
            setMode(modeOf(expression))
        }
    }
    const own = emitted?.value === expression ? emitted : null
    const schedule = own?.schedule ?? utcCronToSchedule(expression) ?? DEFAULT_SCHEDULE
    const cronError = mode === "cron" ? validateCron(expression) : null

    const emit = (next: string, from: Schedule | null) => {
        setEmitted({ value: next, schedule: from })
        onChange(next)
    }
    const changeSchedule = (next: Schedule) => {
        const converted = scheduleToUtcCron(next)
        emit(converted.ok ? converted.cron : invalidScheduleMarker(converted.error), next)
    }
    const changeMode = (next: Mode) => {
        // Voltar ao agendamento com um cron que não cabe nele: grava o do editor (o padrão do editor).
        if (next === "schedule" && !own?.schedule && !utcCronToSchedule(expression)) changeSchedule(DEFAULT_SCHEDULE)
        setMode(next)
    }
    const conversionError = (next: Schedule) => {
        const converted = scheduleToUtcCron(next)
        return converted.ok ? null : converted.error
    }

    return (
        <div className="space-y-2" data-testid="schedule-setting">
            <OptionTabs id={id} aria-label="Formato do agendamento" options={MODES} value={mode} onChange={changeMode} disabled={disabled} />
            <AnimatePresence mode="wait" initial={false}>
                {mode === "schedule" ? (
                    <motion.div key="schedule" {...fade}>
                        <ScheduleEditor value={schedule} onChange={changeSchedule} disabled={disabled} validate={conversionError} />
                    </motion.div>
                ) : (
                    <motion.div key="cron" {...fade} className="space-y-1">
                        <Input aria-label="Expressão cron (UTC)" className="font-mono" value={expression.startsWith("invalid-schedule:") ? "" : expression} placeholder="0 3 * * *" onChange={(event) => emit(event.target.value, null)} disabled={disabled} />
                        <p className={cronError ? "text-xs text-destructive" : "text-xs text-muted-foreground"} role={cronError ? "alert" : undefined}>
                            {cronError ?? "5 campos (minuto hora dia mês dia-da-semana), avaliados em UTC."}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
            {nextRunAt !== undefined && <p className="text-[11px] text-muted-foreground">Próxima execução: {nextRunAt ? formatDateTime(nextRunAt) : "—"}</p>}
        </div>
    )
}
