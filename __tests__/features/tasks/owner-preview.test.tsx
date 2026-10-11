/** @vitest-environment jsdom */

import React from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ClienteOrcamentoDto, DraftEstimateDto, OrcamentoDraftDto } from "@/features/orcamentos/types"

const mocks = vi.hoisted(() => ({
    push: vi.fn(),
    approve: vi.fn(),
    correction: vi.fn(),
    create: vi.fn(),
    start: vi.fn(),
    runEstimate: vi.fn(),
    retryEstimate: vi.fn(),
    draft: { data: undefined as unknown, isLoading: false, isError: false, error: null as unknown, refetch: vi.fn() },
    review: { state: null as unknown },
    clients: { data: [] as unknown[], isLoading: false },
    projects: { data: { projects: [] as unknown[] }, isLoading: false, isError: false, error: null as unknown, refetch: vi.fn() },
}))

vi.mock("framer-motion", async () => (await import("../../helpers/framer-motion")).framerMotionMock())
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock("@/features/tasks/preview/hooks", () => ({
    useOwnerDraft: () => mocks.draft,
    useCreateOwnerDraft: () => ({ mutateAsync: mocks.create, isPending: false }),
    useSetOwnerCorrection: () => ({ mutateAsync: mocks.correction, isPending: false, error: null }),
    useApproveOwnerDraft: () => ({ mutateAsync: mocks.approve, isPending: false, error: null }),
}))
vi.mock("@/features/tasks/preview/useOwnerPreviewReview", () => ({
    useOwnerPreviewReview: () => ({ state: mocks.review.state, start: mocks.start, runEstimate: mocks.runEstimate, retryEstimate: mocks.retryEstimate }),
}))
vi.mock("@/features/orcamentos/hooks/useOrcamentos", () => ({ useOrcamentoClients: () => mocks.clients }))
vi.mock("@/features/tasks/hooks/useTasks", async (original) => ({
    ...(await original<typeof import("@/features/tasks/hooks/useTasks")>()),
    useTaskOptions: () => mocks.projects,
}))

import { PreviewEstimateCard } from "@/features/tasks/preview/components/PreviewEstimateCard"
import { OwnerPreviewReviewPage } from "@/features/tasks/preview/components/OwnerPreviewReviewPage"
import { OwnerPreviewFormPage } from "@/features/tasks/preview/components/OwnerPreviewFormPage"

const client = (over: Partial<ClienteOrcamentoDto> = {}): ClienteOrcamentoDto => ({
    id: "c1",
    name: "Acme",
    tokenPrefix: "cli_x",
    portalPath: "/cliente?t=x",
    projectIds: ["p1"],
    projects: [],
    hourlyRate: 40,
    profitFactor: 10,
    active: true,
    createdAt: null,
    updatedAt: null,
    ...over,
})

const draftDto = (over: Partial<OrcamentoDraftDto> = {}): OrcamentoDraftDto => ({
    id: "d1",
    projectId: "p1",
    projectName: "o/portal",
    projectRepo: { id: "p1", name: "o/portal", repo: "o/portal", sigla: "POR", ownerAvatarUrl: null, description: null, private: false },
    description: "Ajustar o rodapé",
    correction: null,
    preview: { title: "Corrigir o rodapé", taskType: "bugfix", priority: "high", technicalSpec: "## Passos", summary: "Corrige o rodapé" },
    tags: [],
    model: "gemini/pro",
    status: "draft",
    taskId: null,
    estimate: { hours: 2, clientHours: null, billingBrl: null },
    estimateClientId: null,
    estimateClientName: null,
    createdAt: null,
    ...over,
})

const renderCard = (props: Partial<React.ComponentProps<typeof PreviewEstimateCard>> = {}) => {
    const onPickClient = vi.fn()
    const onRetry = vi.fn()
    render(<PreviewEstimateCard estimate={null} estimating={false} error={null} onRetry={onRetry} clients={[]} clientId={null} onPickClient={onPickClient} {...props} />)
    return { onPickClient, onRetry }
}

beforeEach(() => {
    vi.clearAllMocks()
    mocks.draft = { data: draftDto(), isLoading: false, isError: false, error: null, refetch: vi.fn() }
    mocks.review = { state: { generatingPreview: false, preview: draftDto().preview, estimating: false, estimate: draftDto().estimate, tags: [], notice: null, error: null } }
    mocks.approve = vi.fn(async () => ({ id: "t1", code: "POR-1" }))
    mocks.correction = vi.fn(async () => draftDto())
    mocks.create = vi.fn(async () => ({ id: "d9" }))
    mocks.runEstimate = vi.fn(async () => true)
    mocks.clients = { data: [], isLoading: false }
    mocks.projects = { data: { projects: [{ id: "a".repeat(24), name: "Portal", repo: "o/portal", sigla: "POR" }] }, isLoading: false, isError: false, error: null, refetch: vi.fn() }
})

describe("PreviewEstimateCard (prévia do dono)", () => {
    it("sem cliente mostra as horas reais e nenhum custo", () => {
        renderCard({ estimate: { hours: 2, clientHours: null, billingBrl: null } })
        expect(screen.getByText("Horas estimadas")).toBeTruthy()
        expect(screen.getByText("2:00 h")).toBeTruthy()
        expect(screen.queryByText("Faturamento")).toBeNull()
        expect(screen.getByText("Escolha um cliente para ver o prazo e o faturamento.")).toBeTruthy()
    })

    it("com cliente mostra o prazo e o faturamento", () => {
        const estimate: DraftEstimateDto = { hours: 2, clientHours: 20, billingBrl: 800 }
        renderCard({ estimate, clients: [client()], clientId: "c1" })
        expect(screen.getByText("Horas estimadas")).toBeTruthy()
        expect(screen.getByText("2:00 h")).toBeTruthy()
        expect(screen.getByText("Prazo do cliente")).toBeTruthy()
        expect(screen.getByText("20:00 h")).toBeTruthy()
        expect(screen.getByText("Faturamento")).toBeTruthy()
        expect(screen.getByText("Acme")).toBeTruthy()
    })

    it("escolher o cliente na lista dispara a reestimativa", async () => {
        const { onPickClient } = renderCard({ estimate: { hours: 2, clientHours: null, billingBrl: null }, clients: [client()] })
        fireEvent.click(screen.getByRole("button", { name: /Escolher cliente/ }))
        fireEvent.click(await screen.findByRole("option", { name: /Acme/ }))
        expect(onPickClient).toHaveBeenCalledWith("c1")
    })

    it("limpar o cliente dispara a reestimativa sem cliente", () => {
        const { onPickClient } = renderCard({ estimate: { hours: 2, clientHours: 20, billingBrl: 800 }, clients: [client()], clientId: "c1" })
        fireEvent.click(screen.getByRole("button", { name: "Limpar cliente" }))
        expect(onPickClient).toHaveBeenCalledWith(null)
    })

    it("em erro mostra a mensagem com Tentar novamente", () => {
        const { onRetry } = renderCard({ error: "Falha na estimativa" })
        expect(screen.getByText("Falha na estimativa")).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: /Tentar novamente/ }))
        expect(onRetry).toHaveBeenCalled()
    })
})

describe("revisão da prévia do dono", () => {
    it("aprovar navega para a página da tarefa criada", async () => {
        render(<OwnerPreviewReviewPage draftId="d1" />)
        expect(screen.getByText("Corrigir o rodapé")).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: /Aprovar tarefa/ }))
        await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/tarefas/t1"))
    })

    it("solicitar correção registra o texto e regenera a prévia", async () => {
        render(<OwnerPreviewReviewPage draftId="d1" />)
        fireEvent.change(screen.getByPlaceholderText(/Ex\.: O prazo/), { target: { value: "Deixe o prazo menor" } })
        fireEvent.click(screen.getByRole("button", { name: /Solicitar correção/ }))
        await waitFor(() => expect(mocks.correction).toHaveBeenCalledWith("Deixe o prazo menor"))
        expect(mocks.start).toHaveBeenCalled()
    })
})

describe("formulário da nova prévia", () => {
    it("avançar cria o rascunho e segue para a revisão", async () => {
        render(<OwnerPreviewFormPage />)
        fireEvent.click(screen.getByRole("button", { name: "Repositório" }))
        fireEvent.click(await screen.findByRole("option", { name: /o\/portal/ }))
        fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Ajustar o rodapé" } })
        const form = screen.getByRole("button", { name: "Avançar" }).closest("form")
        fireEvent.submit(form!)
        await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({ projectId: "a".repeat(24), description: "Ajustar o rodapé" }))
        expect(mocks.push).toHaveBeenCalledWith("/tarefas/previa/d9")
    })

    it("sem repositórios mostra o estado vazio com o link da integração", () => {
        mocks.projects = { data: { projects: [] }, isLoading: false, isError: false, error: null, refetch: vi.fn() }
        render(<OwnerPreviewFormPage />)
        expect(screen.getByText("Nenhum repositório vinculado")).toBeTruthy()
        expect(screen.getByRole("link", { name: /Ir para a integração GitHub/ }).getAttribute("href")).toBe("/integracoes/github")
    })
})
