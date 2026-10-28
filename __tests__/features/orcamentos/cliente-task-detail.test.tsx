/** @vitest-environment happy-dom */

import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { framerMotionMock } from "../../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())

import type { ClienteTaskDetailDto } from "@/features/orcamentos/types"
import { ClientePortalProvider, type ClientePortalSession } from "@/features/orcamentos/portal/ClientePortalContext"
import { ClienteCommentsSection } from "@/features/orcamentos/portal/components/ClienteCommentsSection"
import { ClienteTaskSidebar } from "@/features/orcamentos/portal/components/ClienteTaskSidebar"
import { ClienteTaskTabs } from "@/features/orcamentos/portal/components/ClienteTaskTabs"

const task: ClienteTaskDetailDto = {
    id: "t1",
    code: "APP-1",
    columnId: "todo",
    order: 0,
    title: "Ajustar o rodapé",
    summary: "Corrige o rodapé",
    taskType: "bugfix",
    priority: "high",
    archived: false,
    project: { id: "p", name: "acme/app", repo: "acme/app", sigla: "APP" },
    estimate: { clientHours: 20, billingBrl: 800 },
    createdAt: "2026-01-01T10:00:00.000Z",
    updatedAt: "2026-01-02T10:00:00.000Z",
    description: "Descrição do cliente",
    technicalSpec: "Especificação técnica",
    comments: [
        { id: "c1", content: "Comentário do cliente", authorType: "client", authorName: "Acme", createdAt: "2026-01-01T10:00:00.000Z" },
        { id: "c2", content: "Comentário do dono", authorType: "owner", authorName: "Fernando", createdAt: "2026-01-01T11:00:00.000Z" },
    ],
}

const session: ClientePortalSession = { clientId: "c1", clientName: "Acme", isAdmin: false, preview: false, user: { id: "u1", username: "acme", email: null }, clients: [] }

function Providers({ children }: { children: ReactNode }) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return (
        <QueryClientProvider client={queryClient}>
            <ClientePortalProvider session={session}>{children}</ClientePortalProvider>
        </QueryClientProvider>
    )
}

describe("página da tarefa do cliente", () => {
    it("mostra só Descrição, Especificação técnica e Comentários (sem Histórico nem Horas)", () => {
        render(
            <Providers>
                <ClienteTaskTabs task={task} value="description" onValueChange={() => {}} />
            </Providers>,
        )
        expect(screen.getByText("Descrição do cliente")).toBeTruthy()
        expect(screen.getByRole("tab", { name: "Descrição" })).toBeTruthy()
        expect(screen.getByRole("tab", { name: "Especificação técnica" })).toBeTruthy()
        expect(screen.getByRole("tab", { name: /Comentários/ })).toBeTruthy()
        expect(screen.queryByRole("tab", { name: "Histórico" })).toBeNull()
        expect(screen.queryByRole("tab", { name: "Horas" })).toBeNull()
    })

    it("o formulário de comentários lista os autores", () => {
        render(
            <Providers>
                <ClienteCommentsSection taskId={task.id} comments={task.comments} />
            </Providers>,
        )
        expect(screen.getByText("Comentário do cliente")).toBeTruthy()
        expect(screen.getByText("Acme")).toBeTruthy()
        expect(screen.getByText("Comentário do dono")).toBeTruthy()
        expect(screen.getByText("Fernando")).toBeTruthy()
    })

    it("a coluna lateral mostra a estimativa inflada e não expõe horas reais nem horas apontadas", () => {
        render(<ClienteTaskSidebar task={task} />)
        expect(screen.getByText(/20:00/)).toBeTruthy()
        expect(screen.getByText(/800,00/)).toBeTruthy()
        expect(screen.queryByText(/Horas apontadas/)).toBeNull()
        expect(screen.queryByText(/Estimativa real/)).toBeNull()
    })

    it("com onUpdate, a prioridade da coluna lateral vira um menu editável", () => {
        const { rerender } = render(<ClienteTaskSidebar task={task} />)
        expect(screen.queryByRole("button", { name: "Prioridade: alterar" })).toBeNull()
        rerender(<ClienteTaskSidebar task={task} onUpdate={() => {}} />)
        expect(screen.getByRole("button", { name: "Prioridade: alterar" })).toBeTruthy()
    })
})
