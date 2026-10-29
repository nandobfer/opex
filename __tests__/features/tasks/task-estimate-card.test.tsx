/** @vitest-environment happy-dom */

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

const hoursInput = () => screen.getByLabelText("Horas estimadas") as HTMLInputElement
const saveButton = () => screen.getByRole("button", { name: "Salvar horas estimadas" })

beforeEach(() => vi.clearAllMocks())

describe("TaskEstimateCard", () => {
  it("com cliente, mostra as horas estimadas em hh:mm, o prazo (× fator), o faturamento e o cliente", () => {
    render(<TaskEstimateCard task={task()} />)
    expect(hoursInput().value).toBe("02:00")
    expect(screen.getByText(/Prazo do cliente \(× 10x\)/)).toBeTruthy()
    expect(screen.getByText("20:00 h")).toBeTruthy()
    expect(screen.getByText("R$ 800,00")).toBeTruthy()
    expect(screen.getByText(/Cliente: ACME/)).toBeTruthy()
  })

  it("sem cliente, mostra só as horas reais (sem prazo nem faturamento)", () => {
    render(<TaskEstimateCard task={task({ clientId: null })} />)
    expect(hoursInput().value).toBe("02:00")
    expect(screen.queryByText(/Prazo do cliente/)).toBeNull()
    expect(screen.queryByText(/Faturamento estimado/)).toBeNull()
    expect(screen.queryByText(/Cliente: ACME/)).toBeNull()
    expect(screen.getByText(/Estimativa real de horas/)).toBeTruthy()
  })

  it("sem estimativa, ainda exibe o campo de horas e o botão de IA (não some)", () => {
    render(<TaskEstimateCard task={task({ clientId: null, estimate: null, estimateClientName: null })} />)
    expect(hoursInput().value).toBe("")
    expect(saveButton().hasAttribute("disabled")).toBe(true)
    expect(screen.getByRole("button", { name: /Estimar com IA/ })).toBeTruthy()
    expect(screen.getByText(/Ainda não estimada/)).toBeTruthy()
  })

  it("mostra o formato na ajuda e converte 01:30 para as horas decimais do contrato", async () => {
    render(<TaskEstimateCard task={task()} />)
    expect(screen.getByText(/Duração em horas e minutos \(ex\.: 01:30\)/)).toBeTruthy()
    expect(saveButton().hasAttribute("disabled")).toBe(true)

    fireEvent.change(hoursInput(), { target: { value: "01:30" } })
    expect(saveButton().hasAttribute("disabled")).toBe(false)
    fireEvent.click(saveButton())

    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledWith(1.5))
  })

  it("salva pelo Enter e volta a acompanhar o valor do servidor", async () => {
    render(<TaskEstimateCard task={task()} />)
    fireEvent.change(hoursInput(), { target: { value: "03:15" } })
    fireEvent.keyDown(hoursInput(), { key: "Enter" })

    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledWith(3.25))
    await waitFor(() => expect(hoursInput().value).toBe("02:00"))
  })

  it("não habilita o Salvar quando a duração é a mesma em minutos (02:00 = 2 h)", () => {
    render(<TaskEstimateCard task={task()} />)
    fireEvent.change(hoursInput(), { target: { value: "02:00" } })
    expect(saveButton().hasAttribute("disabled")).toBe(true)
    fireEvent.change(hoursInput(), { target: { value: "120:00" } })
    expect(saveButton().hasAttribute("disabled")).toBe(false)
  })

  it("bloqueia o envio de formato inválido e mostra o erro em pt-BR", () => {
    render(<TaskEstimateCard task={task()} />)
    const input = hoursInput()

    fireEvent.change(input, { target: { value: "1.5" } })
    expect(saveButton().hasAttribute("disabled")).toBe(true)
    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByText(/Use o formato hh:mm/)).toBeTruthy()

    fireEvent.change(input, { target: { value: "01:60" } })
    expect(saveButton().hasAttribute("disabled")).toBe(true)
    expect(screen.getByText(/Use o formato hh:mm/)).toBeTruthy()
  })

  it("avisa o limite do contrato (10000:00) sem acusar erro enquanto digita", () => {
    render(<TaskEstimateCard task={task()} />)
    const input = hoursInput()

    fireEvent.change(input, { target: { value: "10000:01" } })
    expect(saveButton().hasAttribute("disabled")).toBe(true)
    expect(screen.getByText(/Máximo de 10000:00/)).toBeTruthy()

    fireEvent.change(input, { target: { value: "1:" } })
    expect(input.getAttribute("aria-invalid")).toBe("false")
    expect(screen.getByText(/Duração em horas e minutos/)).toBeTruthy()
  })

  it("aceita zero como estimativa de uma tarefa ainda não estimada", async () => {
    render(<TaskEstimateCard task={task({ clientId: null, estimate: null, estimateClientName: null })} />)
    fireEvent.change(hoursInput(), { target: { value: "00:00" } })
    expect(saveButton().hasAttribute("disabled")).toBe(false)
    fireEvent.click(saveButton())
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledWith(0))
  })

  it("preserva o que foi digitado quando o salvamento falha", async () => {
    mocks.mutateAsync.mockRejectedValueOnce(new Error("falhou"))
    render(<TaskEstimateCard task={task()} />)
    fireEvent.change(hoursInput(), { target: { value: "04:45" } })
    fireEvent.click(saveButton())

    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledWith(4.75))
    expect(hoursInput().value).toBe("04:45")
  })

  it("acompanha a estimativa nova do servidor (ex.: gerada por IA) enquanto não há edição local", () => {
    const { rerender } = render(<TaskEstimateCard task={task({ estimate: null, estimateClientName: null })} />)
    expect(hoursInput().value).toBe("")

    rerender(<TaskEstimateCard task={task({ estimate: { hours: 1.5, clientHours: 15, billingBrl: 600, factor: 10, hourlyRate: 40, model: "gemini/pro", generatedAt: null } })} />)
    expect(hoursInput().value).toBe("01:30")
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
