/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn().mockResolvedValue({}), generate: vi.fn().mockResolvedValue(undefined) }))

vi.mock("framer-motion", async () => (await import("../../helpers/framer-motion")).framerMotionMock())
vi.mock("@/features/tasks/hooks/useTasks", () => ({
  useUpdateTaskEstimate: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
}))
vi.mock("@/features/tasks/hooks/useGenerateTaskEstimate", () => ({
  useGenerateTaskEstimate: () => ({ running: false, notice: null, error: null, estimate: null, generate: mocks.generate }),
}))

import { TaskEstimateCard } from "@/features/tasks/components/detail/TaskEstimateCard"
import type { TaskDetailDto } from "@/features/tasks/types"

const task = (overrides: Partial<TaskDetailDto> = {}): TaskDetailDto => ({
  id: "a".repeat(24),
  code: "OPX-1",
  columnId: "todo",
  order: 0,
  title: "Tarefa",
  summary: null,
  tags: [],
  taskType: "feature",
  priority: "medium",
  archived: false,
  project: null,
  agenticFlow: "preview",
  createdAt: null,
  updatedAt: null,
  clientId: "c".repeat(24),
  estimate: { hours: 2, clientHours: 20, billingBrl: 800, factor: 10, hourlyRate: 40, model: "gemini/pro", generatedAt: null },
  description: null,
  technicalSpec: null,
  comments: [],
  history: [],
  timeLogs: [],
  totalTimeLogged: 0,
  estimateClientName: "ACME",
  ...overrides,
})

beforeEach(() => vi.clearAllMocks())

describe("TaskEstimateCard", () => {
  it("com cliente, mostra as horas estimadas, o prazo (× fator), o faturamento e o cliente", () => {
    render(<TaskEstimateCard task={task()} />)
    expect((screen.getByLabelText("Horas estimadas") as HTMLInputElement).value).toBe("2")
    expect(screen.getByText(/Prazo do cliente \(× 10x\)/)).toBeTruthy()
    expect(screen.getByText("20:00 h")).toBeTruthy()
    expect(screen.getByText("R$ 800,00")).toBeTruthy()
    expect(screen.getByText(/Cliente: ACME/)).toBeTruthy()
  })

  it("sem cliente, mostra só as horas reais (sem prazo nem faturamento)", () => {
    render(<TaskEstimateCard task={task({ clientId: null })} />)
    expect((screen.getByLabelText("Horas estimadas") as HTMLInputElement).value).toBe("2")
    expect(screen.queryByText(/Prazo do cliente/)).toBeNull()
    expect(screen.queryByText(/Faturamento estimado/)).toBeNull()
    expect(screen.queryByText(/Cliente: ACME/)).toBeNull()
    expect(screen.getByText(/Estimativa real de horas/)).toBeTruthy()
  })

  it("sem estimativa, ainda exibe o campo de horas e o botão de IA (não some)", () => {
    render(<TaskEstimateCard task={task({ clientId: null, estimate: null, estimateClientName: null })} />)
    expect((screen.getByLabelText("Horas estimadas") as HTMLInputElement).value).toBe("")
    expect(screen.getByRole("button", { name: /Estimar com IA/ })).toBeTruthy()
    expect(screen.getByText(/Ainda não estimada/)).toBeTruthy()
  })

  it("salva as horas editadas chamando a mutação com o número (aceita vírgula)", async () => {
    render(<TaskEstimateCard task={task()} />)
    const input = screen.getByLabelText("Horas estimadas")
    const button = screen.getByRole("button", { name: "Salvar horas estimadas" })
    expect(button.hasAttribute("disabled")).toBe(true)

    fireEvent.change(input, { target: { value: "3,5" } })
    expect(button.hasAttribute("disabled")).toBe(false)
    fireEvent.click(button)

    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledWith(3.5))
  })

  it("aciona a geração por IA pelo botão", () => {
    render(<TaskEstimateCard task={task({ estimate: null, estimateClientName: null })} />)
    fireEvent.click(screen.getByRole("button", { name: /Estimar com IA/ }))
    expect(mocks.generate).toHaveBeenCalledTimes(1)
  })

  it("com estimativa, o botão vira 'Regerar com IA'", () => {
    render(<TaskEstimateCard task={task()} />)
    expect(screen.getByRole("button", { name: /Regerar com IA/ })).toBeTruthy()
  })
})
