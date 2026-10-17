/** @vitest-environment jsdom */
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
const mocks = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("framer-motion", async () => (await import("../../helpers/framer-motion")).framerMotionMock())
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}))
vi.mock("@/features/environments/hooks/useEnvironments", () => ({
    useEnvironmentApi: () => ({ href: "/ambientes" }),
}))
import { EnvironmentHeader } from "@/features/environments/components/EnvironmentHeader"
import { EnvironmentListPane } from "@/features/environments/components/EnvironmentListPane"
import type { EnvironmentDto } from "@/features/environments/types"
import { config, repoId, envId } from "./fixtures"

const otherId = "d".repeat(24)
const repos = [{ id: repoId, name: "App", repo: "org/app" }]
const environment = (id: string, patch: Partial<EnvironmentDto> = {}): EnvironmentDto =>
    ({
        ...config,
        id,
        projectId: repoId,
        revision: 1,
        dbVersion: "m002",
        observedAt: null,
        compose: [],
        activeOperationId: null,
        ...patch,
    }) as EnvironmentDto

const list = (props: Partial<React.ComponentProps<typeof EnvironmentListPane>> = {}) => (
    <EnvironmentListPane
        repoId={repoId}
        repos={repos}
        environments={[]}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
        canEdit
        selected=""
        detailOpen={false}
        {...props}
    />
)

afterEach(cleanup)

describe("painel lateral de ambientes", () => {
    it("lista os ambientes, marca o ativo e filtra pela busca", () => {
        const items = [
            environment(envId, { name: "Produção", branch: "main" }),
            environment(otherId, { name: "Homologação", branch: "dev" }),
        ]
        render(list({ environments: items, selected: envId }))
        const active = screen.getByRole("link", { name: /Produção/ })
        expect(active.getAttribute("aria-current")).toBe("page")
        expect(active.className).toContain("bg-primary/15")
        expect(screen.getByRole("link", { name: /Produção/ }).getAttribute("href")).toBe(`/ambientes/${repoId}?ambiente=${envId}`)

        fireEvent.change(screen.getByLabelText("Buscar ambientes"), { target: { value: "Homolog" } })
        expect(screen.queryByRole("link", { name: /Produção/ })).toBeNull()
        expect(screen.getByRole("link", { name: /Homologação/ })).toBeTruthy()
    })

    it("ambiente em operação ganha o chip de estado com a versão do banco", () => {
        render(list({ environments: [environment(envId, { activeOperationId: "op" })] }))
        expect(screen.getByText("Em operação")).toBeTruthy()
        expect(screen.getByText("banco m002")).toBeTruthy()
    })

    it("sem ambientes oferece criar o primeiro; sem permissão não mostra as ações", () => {
        const { rerender } = render(list())
        expect(screen.getByText("Nenhum ambiente")).toBeTruthy()
        expect(screen.getByRole("button", { name: "Novo ambiente" })).toBeTruthy()

        rerender(list({ canEdit: false }))
        expect(screen.queryByRole("link", { name: "Novo ambiente" })).toBeNull()
        expect(screen.queryByRole("link", { name: "Configurações do repositório" })).toBeNull()
    })

    it("no celular o painel some quando há um ambiente aberto", () => {
        const { rerender } = render(list())
        expect(screen.getByTestId("environments-pane").className).not.toContain("max-lg:hidden")
        rerender(list({ detailOpen: true }))
        expect(screen.getByTestId("environments-pane").className).toContain("max-lg:hidden")
    })

    it("falha ao carregar mostra o erro com tentar novamente", () => {
        const onRetry = vi.fn()
        render(list({ isError: true, onRetry }))
        fireEvent.click(screen.getByRole("button", { name: /Tentar novamente/ }))
        expect(onRetry).toHaveBeenCalled()
    })
})

describe("cabeçalho do ambiente", () => {
    it("mostra identidade, metadados e dispara os atalhos das abas", () => {
        const onSelectTab = vi.fn()
        render(
            <EnvironmentHeader
                environment={environment(envId, {
                    branch: "main",
                    directory: "/srv/app",
                    port: 3100,
                    activeOperationId: "op",
                })}
                operationStage="Agente"
                configHref="/ambientes/repo/ambiente/env"
                onSelectTab={onSelectTab}
            />,
        )
        expect(screen.getByRole("heading", { name: "Produção" })).toBeTruthy()
        expect(screen.getByText("Agente")).toBeTruthy()
        expect(screen.getByText("main")).toBeTruthy()
        expect(screen.getByTitle("/srv/app")).toBeTruthy()
        expect(screen.getByText("porta 3100")).toBeTruthy()
        expect(screen.getByRole("link", { name: "Configurações do ambiente" }).getAttribute("href")).toBe(
            "/ambientes/repo/ambiente/env",
        )

        fireEvent.click(screen.getByRole("button", { name: /Publicar/ }))
        expect(onSelectTab).toHaveBeenCalledWith("publish")
        fireEvent.click(screen.getByRole("button", { name: /Restaurar/ }))
        expect(onSelectTab).toHaveBeenCalledWith("restore")
    })

    it("sem operação e sem permissão o cabeçalho não oferece configuração", () => {
        render(
            <EnvironmentHeader
                environment={environment(envId)}
                operationStage={null}
                configHref={null}
                onSelectTab={vi.fn()}
            />,
        )
        expect(screen.getByText("Sem operação")).toBeTruthy()
        expect(screen.queryByRole("link", { name: "Configurações do ambiente" })).toBeNull()
    })
})
