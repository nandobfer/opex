/** @vitest-environment jsdom */
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
vi.mock("framer-motion", async () => (await import("../helpers/framer-motion")).framerMotionMock())
vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}))
import { WorkspacePane } from "@/components/workspace/WorkspacePane"
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell"

afterEach(cleanup)

describe("casca de duas colunas", () => {
    it("mostra o painel principal com o voltar no celular quando há item aberto", () => {
        render(
            <WorkspaceShell
                ariaLabel="Teste"
                detailOpen
                viewKey="item"
                mainTestId="main"
                backHref="/lista"
                backLabel="Voltar para a lista"
                aside={<div>lateral</div>}
            >
                <p>conteúdo</p>
            </WorkspaceShell>,
        )
        expect(screen.getByText("lateral")).toBeTruthy()
        expect(screen.getByText("conteúdo")).toBeTruthy()
        const back = screen.getByRole("link", { name: /Voltar para a lista/ })
        expect(back.getAttribute("href")).toBe("/lista")
        expect(back.className).toContain("lg:hidden")
    })

    it("esconde o painel principal no celular quando não há item aberto", () => {
        render(
            <WorkspaceShell ariaLabel="Teste" detailOpen={false} viewKey="vazio" mainTestId="main" aside={<div>lateral</div>}>
                <p>conteúdo</p>
            </WorkspaceShell>,
        )
        expect(screen.getByTestId("main").className).toContain("max-lg:hidden")
        expect(screen.queryByRole("link")).toBeNull()
    })
})

describe("painel lateral do workspace", () => {
    it("mostra título, contador, ações, controles e o corpo", () => {
        render(
            <WorkspacePane
                title="Ambientes"
                count={2}
                ariaLabel="Ambientes do repositório"
                testId="pane"
                actions={<button type="button">ação</button>}
                header={<input aria-label="busca" />}
            >
                <p>corpo</p>
            </WorkspacePane>,
        )
        expect(screen.getByRole("heading", { name: /Ambientes/ }).textContent).toContain("2")
        expect(screen.getByRole("button", { name: "ação" })).toBeTruthy()
        expect(screen.getByLabelText("busca")).toBeTruthy()
        expect(screen.getByText("corpo")).toBeTruthy()
        expect(screen.getByTestId("pane").className).toContain("lg:w-[340px]")
        expect(screen.getByRole("region", { name: "Ambientes do repositório" })).toBeTruthy()
    })
})
