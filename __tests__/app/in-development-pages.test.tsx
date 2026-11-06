/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { framerMotionMock } from "../helpers/framer-motion"

const mocks = vi.hoisted(() => ({
    redirect: vi.fn(),
    notFound: vi.fn(() => {
        throw new Error("NEXT_NOT_FOUND")
    }),
    resolveTaskRoute: vi.fn(),
}))

vi.mock("framer-motion", () => framerMotionMock())
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))
vi.mock("@/features/tasks/components/TasksPage", () => ({ TasksPage: () => <div data-testid="tasks" /> }))
vi.mock("@/features/dashboard/components/DashboardPage", () => ({ DashboardPage: () => <div data-testid="dashboard" /> }))
vi.mock("@/features/tasks/components/detail/TaskDetailPage", () => ({
    TaskDetailPage: ({ id }: { id: string }) => <div data-testid="task">{id}</div>,
}))
vi.mock("@/features/tasks/server/resolve-route", () => ({ resolveTaskRoute: mocks.resolveTaskRoute }))
vi.mock("@/features/integrations/components/IntegrationDetailPage", () => ({
    IntegrationDetailPage: ({ id }: { id: string }) => <div data-testid="detail">{id}</div>,
}))

import HomePage from "@/app/page"
import UnknownPage from "@/app/(app)/[...rest]/page"
import DashboardsPage from "@/app/(app)/dashboard/page"
import TarefasPage from "@/app/(app)/tarefas/page"
import TarefaPage from "@/app/(app)/tarefas/[id]/page"
import IntegracaoPage from "@/app/(app)/integracoes/[id]/page"
import { APP_NAV_ITEMS, HOME_HREF } from "@/features/layout/navigation"

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe("páginas do app", () => {
    it("a raiz redireciona para a página inicial (Dashboards)", () => {
        HomePage()
        expect(mocks.redirect).toHaveBeenCalledWith(HOME_HREF)
    })

    it("Dashboards renderiza a tela da feature", () => {
        render(<DashboardsPage />)
        expect(screen.getByTestId("dashboard")).toBeTruthy()
    })

    it("Tarefas renderiza o quadro; /tarefas/[código] abre a página da tarefa com o id resolvido", async () => {
        render(<TarefasPage />)
        expect(screen.getByTestId("tasks")).toBeTruthy()
        mocks.resolveTaskRoute.mockResolvedValue({ kind: "render", id: "65f0a1b2c3d4e5f6a7b8c9d0" })
        render(await TarefaPage({ params: Promise.resolve({ id: "ope-145" }) }))
        expect(mocks.resolveTaskRoute.mock.calls[0]?.[0]).toBe("ope-145")
        expect(mocks.resolveTaskRoute.mock.calls[0]?.[1].pathFor("OPE-145")).toBe("/tarefas/ope-145")
        expect(screen.getByTestId("task").textContent).toBe("65f0a1b2c3d4e5f6a7b8c9d0")
        expect(mocks.redirect).not.toHaveBeenCalled()
    })

    it("/tarefas/<id> (URL antiga) redireciona para o código, preservando a query string", async () => {
        mocks.resolveTaskRoute.mockResolvedValue({ kind: "redirect", path: "/tarefas/ope-145" })
        await TarefaPage({ params: Promise.resolve({ id: "6aee2de28d89a2641930701f" }), searchParams: Promise.resolve({ aba: "spec" }) })
        expect(mocks.redirect).toHaveBeenCalledWith("/tarefas/ope-145?aba=spec")
    })

    it("endereço desconhecido: aviso dentro do shell com volta ao início, nunca 404 cru", () => {
        render(<UnknownPage />)
        expect(screen.getByRole("heading", { name: "Página não encontrada" })).toBeTruthy()
        expect(screen.getByRole("link", { name: "Voltar ao início" }).getAttribute("href")).toBe(HOME_HREF)
    })

    it("detalhe de integração: id do catálogo renderiza; desconhecido ou em desenvolvimento dá 404", async () => {
        render(await IntegracaoPage({ params: Promise.resolve({ id: "crons" }) }))
        expect(screen.getByTestId("detail").textContent).toBe("crons")

        for (const id of ["google_drive", "archflow", "linx"]) {
            await expect(IntegracaoPage({ params: Promise.resolve({ id }) })).rejects.toThrow("NEXT_NOT_FOUND")
        }
    })

    it("todo item de menu tem página (arquivo existe)", () => {
        for (const item of APP_NAV_ITEMS) {
            expect(() => readFileSync(`src/app/(app)${item.href}/page.tsx`)).not.toThrow()
        }
    })
})

describe("layout padrão do Smart Desk", () => {
    it("o espaçamento externo é do shell; páginas não definem contêiner próprio", () => {
        const shell = readFileSync("src/features/layout/components/AppShell.tsx", "utf8")
        expect(shell).toContain("CONTENT_PADDING_X")
        expect(shell).toContain("py-6")
        expect(readFileSync("src/features/layout/content-padding.ts", "utf8")).toContain('CONTENT_PADDING_X = "px-4 md:px-6 lg:px-8"')
        for (const file of [
            "src/features/tasks/components/TasksPage.tsx",
            "src/features/integrations/components/IntegrationList.tsx",
        ]) {
            expect(readFileSync(file, "utf8")).not.toMatch(/mx-auto|max-w-(?:[3-7]xl|screen)/)
        }
    })
})
