/** @vitest-environment jsdom */

import React from "react"
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mocks = vi.hoisted(() => {
    const agent = { agent: null, model: null, variant: null }
    return {
        refetch: vi.fn(),
        save: vi.fn(),
        data: {
            settings: { enabled: false, agents: { planning: { ...agent }, implementation: { ...agent }, build: { ...agent }, pr: { ...agent } }, columns: { queue: null, onStart: null, onPr: null, onDone: null }, ci: { fixCi: true, ciFixLimit: null } },
            isDefault: true,
            availability: { available: false, reason: "OpenCode não configurado" },
            updatedAt: null,
        },
    }
})

vi.mock("@/features/agentic/hooks/useAgentic", () => ({
    useAgenticRealtime: vi.fn(),
    useAgenticSettings: () => ({ data: mocks.data, isLoading: false, isError: false, error: null, refetch: mocks.refetch }),
    useSaveAgenticSettings: () => ({ mutateAsync: mocks.save, isPending: false }),
}))
vi.mock("@/features/agentic/components/settings/AgentRolesCard", () => ({ AgentRolesCard: () => <div data-testid="agent-roles">agentes padrão</div> }))
vi.mock("@/features/agentic/components/settings/CentralsCard", () => ({ CentralsCard: () => <div data-testid="centrals">centrais</div> }))
vi.mock("@/features/agentic/components/settings/ColumnsCard", () => ({ ColumnsCard: ({ title }: { title: string }) => <div data-testid="columns-card">{title}</div> }))

import { AgenticTab } from "@/features/agentic/components/settings/AgenticTab"
import { useLocalTabs } from "@/features/integrations/components/tabs/useLocalTabs"
import { useIntegrationTab } from "@/features/integrations/components/tabs/useIntegrationTab"

beforeEach(() => {
    window.history.replaceState({}, "", "/integracoes/ia?aba=desenvolvimento-agentico")
    window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() })) as unknown as typeof window.matchMedia
})
afterEach(() => {
    cleanup()
    vi.clearAllMocks()
})

describe("useLocalTabs", () => {
    it("troca direto quando não há alterações", () => {
        const { result } = renderHook(() => useLocalTabs<"a" | "b">("a", false, () => {}))
        expect(result.current.tab).toBe("a")
        act(() => result.current.requestTab("b"))
        expect(result.current.tab).toBe("b")
        expect(result.current.pendingTab).toBeNull()
    })

    it("com alterações pede confirmação e só troca ao confirmar (descartando)", () => {
        const discard = vi.fn()
        const { result } = renderHook(() => useLocalTabs<"a" | "b">("a", true, discard))
        act(() => result.current.requestTab("b"))
        expect(result.current.tab).toBe("a")
        expect(result.current.pendingTab).toBe("b")
        act(() => result.current.confirmDiscard())
        expect(discard).toHaveBeenCalledTimes(1)
        expect(result.current.tab).toBe("b")
        expect(result.current.pendingTab).toBeNull()
    })

    it("cancelar mantém a aba e limpa o pedido sem descartar", () => {
        const discard = vi.fn()
        const { result } = renderHook(() => useLocalTabs<"a" | "b">("a", true, discard))
        act(() => result.current.requestTab("b"))
        act(() => result.current.cancelDiscard())
        expect(result.current.tab).toBe("a")
        expect(result.current.pendingTab).toBeNull()
        expect(discard).not.toHaveBeenCalled()
    })

    it("clicar na aba atual não abre confirmação", () => {
        const { result } = renderHook(() => useLocalTabs<"a" | "b">("a", true, () => {}))
        act(() => result.current.requestTab("a"))
        expect(result.current.pendingTab).toBeNull()
    })
})

describe("AgenticTab: abas internas", () => {
    it("atalho abre diretamente Centrais de desenvolvimento", () => {
        window.history.replaceState({}, "", "/integracoes/ia?aba=desenvolvimento-agentico&abaAgentic=centrais")
        render(<AgenticTab onDirtyChange={vi.fn()} />)
        expect(screen.getByRole("tab", { name: "Centrais de desenvolvimento" }).getAttribute("aria-selected")).toBe("true")
        expect(screen.getByTestId("centrals")).toBeTruthy()
    })

    it("subaba preserva aba principal, busca e hash e confirma descarte antes de alterar URL", () => {
        window.history.replaceState({}, "", "/integracoes/ia?aba=desenvolvimento-agentico&buscaCentrais=opex#config")
        const discard = vi.fn()
        const { result } = renderHook(() => useIntegrationTab(["agentes", "centrais"] as const, "agentes", true, discard, "abaAgentic"))
        act(() => result.current.requestTab("centrais"))
        expect(window.location.search).not.toContain("abaAgentic")
        expect(result.current.pendingTab).toBe("centrais")
        act(() => result.current.confirmDiscard())
        expect(discard).toHaveBeenCalledTimes(1)
        expect(new URLSearchParams(window.location.search).get("aba")).toBe("desenvolvimento-agentico")
        expect(new URLSearchParams(window.location.search).get("buscaCentrais")).toBe("opex")
        expect(new URLSearchParams(window.location.search).get("abaAgentic")).toBe("centrais")
        expect(window.location.hash).toBe("#config")
    })

    it("abre na aba Agentes com os agentes padrão e Salvar/Desfazer, sem as centrais", () => {
        render(<AgenticTab onDirtyChange={vi.fn()} />)
        expect(screen.getByRole("tab", { name: "Agentes" }).getAttribute("aria-selected")).toBe("true")
        expect(screen.getByRole("tab", { name: "Centrais de desenvolvimento" }).getAttribute("aria-selected")).toBe("false")
        expect(screen.getByTestId("agent-roles")).toBeTruthy()
        expect(screen.getByRole("button", { name: /Salvar/ })).toBeTruthy()
        expect(screen.getByRole("button", { name: /Desfazer/ })).toBeTruthy()
        expect(screen.queryByTestId("centrals")).toBeNull()
    })

    it("troca para Centrais de desenvolvimento e mostra só o card das centrais", () => {
        render(<AgenticTab onDirtyChange={vi.fn()} />)
        fireEvent.click(screen.getByRole("tab", { name: "Centrais de desenvolvimento" }))
        expect(screen.getByRole("tab", { name: "Centrais de desenvolvimento" }).getAttribute("aria-selected")).toBe("true")
        expect(screen.getByTestId("centrals")).toBeTruthy()
        expect(screen.queryByTestId("agent-roles")).toBeNull()
        expect(screen.queryAllByTestId("columns-card")).toHaveLength(0)
        expect(screen.queryByRole("button", { name: /Salvar/ })).toBeNull()
    })

    it("traz a fila e a movimentação globais junto dos agentes padrão", () => {
        render(<AgenticTab onDirtyChange={vi.fn()} />)
        const cards = screen.getAllByTestId("columns-card")
        expect(cards).toHaveLength(2)
        expect(cards.map((card) => card.textContent)).toEqual(["Fila da central de desenvolvimento", "Movimentação das colunas"])
    })

    it("traz o padrão global da correção de CI (ligada, sem limite) junto dos agentes padrão", () => {
        render(<AgenticTab onDirtyChange={vi.fn()} />)
        expect(screen.getByText("Corrigir CI falho")).toBeTruthy()
        expect((screen.getByLabelText("Corrigir automaticamente") as HTMLElement).getAttribute("aria-checked")).toBe("true")
        expect((screen.getByLabelText(/Máximo de correções seguidas por PR/) as HTMLInputElement).value).toBe("")
        expect(screen.queryByRole("radio", { name: "Padrão global" })).toBeNull()
    })
})
