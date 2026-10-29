/** @vitest-environment happy-dom */

import React from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn(), toastSuccess: vi.fn(), toastError: vi.fn() }))

vi.mock("framer-motion", () => {
    const MOTION_PROPS = new Set(["initial", "animate", "exit", "variants", "transition", "whileTap", "layout"])
    const passthrough = (tag: string) =>
        function Motion({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) {
            const domProps = Object.fromEntries(Object.entries(props).filter(([key]) => !MOTION_PROPS.has(key)))
            return React.createElement(tag, domProps, children)
        }
    return {
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        motion: { div: passthrough("div"), p: passthrough("p"), button: passthrough("button"), span: passthrough("span") },
    }
})
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }))
vi.mock("@/features/integrations/hooks/useIntegrations", () => ({
    useRunCronJob: () => ({ mutateAsync: mocks.mutateAsync }),
    integrationErrorMessage: (_e: unknown, fallback: string) => fallback,
}))

import { CronJobsEditor, runNowBlockReason } from "@/features/integrations/components/CronJobsEditor"
import { CONTROL, ScheduleEditor } from "@/features/integrations/components/ScheduleEditor"
import { FIELD_GRID } from "@/features/integrations/components/IntegrationDetailPage"
import { TASK_TAGS_CONCLUDED_JOB_ID, type CronJobConfig } from "@/lib/integrations/catalog"

const job: CronJobConfig = {
    id: "cancel",
    label: "Cancelar negociações",
    kind: "http",
    path: "/api/routines/cancel-pending-or-rejected-negotiations",
    schedule: { type: "daily", time: "17:30" },
    enabled: true,
}

beforeEach(() => vi.clearAllMocks())

describe("runNowBlockReason", () => {
    it("libera a rotina salva e sem alterações", () => {
        expect(runNowBlockReason(job, [job], true, false)).toBeNull()
    })

    it("bloqueia sem permissão, em execução, não salva ou com alterações pendentes", () => {
        expect(runNowBlockReason(job, [job], false, false)).toBe("Sem permissão para executar rotinas")
        expect(runNowBlockReason(job, [job], true, true)).toBe("A rotina já está em execução")
        expect(runNowBlockReason(job, [], true, false)).toBe("Salve as alterações antes de executar")
        expect(runNowBlockReason({ ...job, schedule: { type: "daily", time: "18:00" } }, [job], true, false)).toBe(
            "Salve as alterações antes de executar",
        )
    })
})

describe("CronJobsEditor — Executar agora (issue #604)", () => {
    it("pede confirmação e executa a rotina salva, com toast de sucesso", async () => {
        mocks.mutateAsync.mockResolvedValue({ ok: true, message: "HTTP 200", durationMs: 12 })
        render(<CronJobsEditor value={[job]} onChange={vi.fn()} savedJobs={[job]} canRun disabled />)

        fireEvent.click(screen.getByRole("button", { name: "Executar agora: Cancelar negociações" }))
        expect(mocks.mutateAsync).not.toHaveBeenCalled()
        expect(screen.getByText("Executar “Cancelar negociações” agora?")).toBeTruthy()

        fireEvent.click(screen.getByRole("button", { name: "Executar agora" }))
        await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledWith("cancel"))
        await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled())
    })

    it("falha da rotina mostra toast de erro", async () => {
        mocks.mutateAsync.mockResolvedValue({ ok: false, message: "HTTP 500", durationMs: 5 })
        render(<CronJobsEditor value={[job]} onChange={vi.fn()} savedJobs={[job]} canRun />)
        fireEvent.click(screen.getByRole("button", { name: "Executar agora: Cancelar negociações" }))
        fireEvent.click(screen.getByRole("button", { name: "Executar agora" }))
        await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('"Cancelar negociações" falhou: HTTP 500'))
    })

    it("sem permissão o botão fica desabilitado (com motivo no tooltip)", () => {
        render(<CronJobsEditor value={[job]} onChange={vi.fn()} savedJobs={[job]} canRun={false} />)
        const button = screen.getByRole("button", { name: "Executar agora: Cancelar negociações" })
        expect(button.hasAttribute("disabled")).toBe(true)
        expect(screen.getByTestId("run-now-blocked")).toBeTruthy()
    })
})

describe("escopo das tags de concluídas", () => {
    const concluded: CronJobConfig = {
        id: TASK_TAGS_CONCLUDED_JOB_ID,
        label: "Tags concluídas",
        kind: "internal",
        schedule: { type: "interval", minutes: 60 },
        enabled: false,
        scope: "pending",
    }

    it("permite editar o escopo mesmo com a rotina desligada", () => {
        const onChange = vi.fn()
        render(<CronJobsEditor value={[concluded]} onChange={onChange} savedJobs={[concluded]} canRun />)
        fireEvent.click(screen.getByRole("button", { name: "Tags concluídas" }))
        fireEvent.click(screen.getByRole("radio", { name: "Todas" }))
        expect(onChange).toHaveBeenCalledWith([{ ...concluded, scope: "all" }])
        expect(runNowBlockReason({ ...concluded, scope: "all" }, [concluded], true, false)).toBe("Salve as alterações antes de executar")
        expect(screen.getByRole("button", { name: "Executar agora: Tags concluídas" }).hasAttribute("disabled")).toBe(false)
    })

    it("não oferece escopo em outras rotinas", () => {
        render(<CronJobsEditor value={[job]} onChange={vi.fn()} savedJobs={[job]} canRun />)
        fireEvent.click(screen.getByRole("button", { name: "Cancelar negociações" }))
        expect(screen.queryByRole("radio", { name: "Todas" })).toBeNull()
    })
})

describe("rotinas recolhidas e busca", () => {
    const jobs: CronJobConfig[] = [
        job,
        { id: "rotina-b", label: "Rotina B", kind: "internal", schedule: { type: "interval", minutes: 5 }, enabled: true },
    ]

    it("inicia recolhida e expande os campos ao clicar no nome", () => {
        render(<CronJobsEditor value={jobs} onChange={vi.fn()} savedJobs={jobs} canRun />)
        expect(screen.queryByLabelText("Caminho")).toBeNull()
        fireEvent.click(screen.getByRole("button", { name: "Cancelar negociações" }))
        expect(screen.getByLabelText("Caminho")).toBeTruthy()
    })

    it("a busca filtra as rotinas exibidas", () => {
        render(<CronJobsEditor value={jobs} onChange={vi.fn()} savedJobs={jobs} canRun />)
        fireEvent.change(screen.getByLabelText("Buscar rotina"), { target: { value: "Cancelar" } })
        expect(screen.queryByText("Rotina B")).toBeNull()
        expect(screen.getByText("Cancelar negociações")).toBeTruthy()
    })

    it("rotinas escondidas (integração desativada) não aparecem nem na busca, e editar preserva todas", () => {
        const onChange = vi.fn()
        render(<CronJobsEditor value={jobs} onChange={onChange} savedJobs={jobs} canRun hiddenJobIds={new Set(["rotina-b"])} />)
        expect(screen.queryByText("Rotina B")).toBeNull()
        fireEvent.click(screen.getByLabelText("Ativar Cancelar negociações"))
        expect(onChange.mock.calls[0]![0].map((item: CronJobConfig) => item.id)).toEqual(["cancel", "rotina-b"])
        fireEvent.change(screen.getByLabelText("Buscar rotina"), { target: { value: "Rotina" } })
        expect(screen.queryByText("Rotina B")).toBeNull()
    })
})

describe("largura dos campos", () => {
    it("o último campo de quantidade ímpar ocupa a linha inteira; pares dividem a linha", () => {
        expect(FIELD_GRID).toContain("sm:grid-cols-2")
        expect(FIELD_GRID).toContain("sm:[&>*:last-child:nth-child(odd)]:col-span-2")
    })

    it("os controles do agendamento dividem a largura, sem largura fixa", () => {
        render(<ScheduleEditor value={{ type: "monthly", day: 10, time: "08:00" }} onChange={vi.fn()} />)
        for (const label of ["Frequência", "Dia do mês", "Horário"]) {
            const className = screen.getByLabelText(label).getAttribute("class") ?? ""
            for (const cls of CONTROL.split(" ")) expect(className).toContain(cls)
            expect(className).not.toMatch(/\bw-\[|\bw-(20|24)\b/)
        }
    })
})
