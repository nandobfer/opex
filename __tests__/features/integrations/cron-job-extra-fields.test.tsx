/** @vitest-environment happy-dom */

import React from "react"
import { readFileSync } from "node:fs"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CronJobExtraFields, retentionHelp } from "@/features/integrations/components/CronJobExtraFields"
import {
    DEFAULT_CRON_JOBS,
    HEALTH_CHECK_JOB_ID,
    MADDOX_AGENT_SESSIONS_CLEANUP_JOB_ID,
    OPENCODE_SESSIONS_CLEANUP_JOB_ID,
    OPEX_AGENT_SESSIONS_CLEANUP_JOB_ID,
    SESSION_CLEANUP_JOB_IDS,
    TASK_TAGS_CONCLUDED_JOB_ID,
    type CronJobConfig,
} from "@/lib/integrations/catalog"

/** Campos próprios das rotinas internas no card da aba Rotinas: "Dias sem interação" das limpezas de sessões (OPE-106). */

const jobOf = (id: string): CronJobConfig => DEFAULT_CRON_JOBS.find((job) => job.id === id)!

describe("CronJobExtraFields", () => {
    it("mostra 'Dias sem interação' só nas 3 rotinas de limpeza e grava o valor editado", () => {
        for (const id of SESSION_CLEANUP_JOB_IDS) {
            const onChange = vi.fn()
            const { unmount } = render(<CronJobExtraFields job={jobOf(id)} onChange={onChange} />)
            const input = screen.getByLabelText("Dias sem interação") as HTMLInputElement
            expect(input.value).toBe("30")
            fireEvent.change(input, { target: { value: "7" } })
            expect(onChange).toHaveBeenCalledWith({ retentionDays: 7 })
            unmount()
        }
        render(<CronJobExtraFields job={jobOf(HEALTH_CHECK_JOB_ID)} onChange={vi.fn()} />)
        expect(screen.queryByLabelText("Dias sem interação")).toBeNull()
    })

    it("limita o valor entre 1 e 3650 dias; sem o campo salvo mostra o padrão", () => {
        const onChange = vi.fn()
        render(<CronJobExtraFields job={{ ...jobOf(OPEX_AGENT_SESSIONS_CLEANUP_JOB_ID), retentionDays: undefined }} onChange={onChange} />)
        const input = screen.getByLabelText("Dias sem interação") as HTMLInputElement
        expect(input.value).toBe("30")
        fireEvent.change(input, { target: { value: "0" } })
        expect(onChange).toHaveBeenLastCalledWith({ retentionDays: 1 })
        fireEvent.change(input, { target: { value: "99999" } })
        expect(onChange).toHaveBeenLastCalledWith({ retentionDays: 3650 })
    })

    it("o escopo continua só nas tags de concluídas", () => {
        render(<CronJobExtraFields job={jobOf(TASK_TAGS_CONCLUDED_JOB_ID)} onChange={vi.fn()} />)
        expect(screen.getByText("Escopo")).toBeTruthy()
        expect(screen.queryByLabelText("Dias sem interação")).toBeNull()
    })

    it("o texto de ajuda avisa a regra de cada rotina", () => {
        expect(retentionHelp(OPENCODE_SESSIONS_CLEANUP_JOB_ID)).toMatch(/inclusive as suas pessoais/)
        expect(retentionHelp(OPEX_AGENT_SESSIONS_CLEANUP_JOB_ID)).toMatch(/Agente Opex.*Arquiva|Arquiva.*Agente Opex/)
        expect(retentionHelp(MADDOX_AGENT_SESSIONS_CLEANUP_JOB_ID)).toMatch(/Agente Maddox/)
    })

    it("não usa select nem checkbox nativos (controles do design system)", () => {
        const source = readFileSync("src/features/integrations/components/CronJobExtraFields.tsx", "utf8")
        expect(source).not.toMatch(/<select\b/)
        expect(source).not.toMatch(/type="checkbox"/)
    })
})
