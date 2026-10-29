/** @vitest-environment happy-dom */

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
            settings: {
                enabled: false,
                agents: { planning: { ...agent }, implementation: { ...agent }, build: { ...agent }, pr: { ...agent } },
                columns: { queue: null, onStart: null, onPr: null, onDone: null },
                ci: { fixCi: true, ciFixLimit: null },
                liveChat: false,
                ports: { previewPortMin: 5002, previewPortMax: 5998 },
            },
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

    it("mostra as subabas na ordem Configurações Padrão | Agentes | Centrais de desenvolvimento", () => {
        render(<AgenticTab onDirtyChange={vi.fn()} />)
        expect(screen.getAllByRole("tab").map((tab) => tab.textContent?.trim())).toEqual(["Configurações Padrão", "Agentes", "Centrais de desenvolvimento"])
    })

    it("abre em Configurações Padrão com chat, fila, movimentação, CI e portas padrão e Salvar/Desfazer", () => {
        render(<AgenticTab onDirtyChange={vi.fn()} />)
        expect(screen.getByRole("tab", { name: "Configurações Padrão" }).getAttribute("aria-selected")).toBe("true")
        expect(screen.getByText("Chat durante a execução")).toBeTruthy()
        // Fila e movimentação padrão das colunas, herdadas pelas centrais.
        expect(screen.getAllByTestId("columns-card").map((card) => card.textContent)).toEqual(["Fila padrão", "Movimentação padrão das colunas"])
        expect(screen.getByText("Portas da prévia")).toBeTruthy()
        expect((screen.getByLabelText("Porta inicial da prévia") as HTMLInputElement).value).toBe("5002")
        expect((screen.getByLabelText("Porta final da prévia") as HTMLInputElement).value).toBe("5998")
        expect(screen.getByRole("button", { name: /Salvar/ })).toBeTruthy()
        expect(screen.getByRole("button", { name: /Desfazer/ })).toBeTruthy()
        expect(screen.queryByTestId("agent-roles")).toBeNull()
        expect(screen.queryByTestId("centrals")).toBeNull()
    })

    it("a aba Agentes mostra os agentes padrão e Salvar/Desfazer, sem as configurações padrão movidas", () => {
        render(<AgenticTab onDirtyChange={vi.fn()} />)
        fireEvent.click(screen.getByRole("tab", { name: "Agentes" }))
        expect(screen.getByRole("tab", { name: "Agentes" }).getAttribute("aria-selected")).toBe("true")
        expect(screen.getByTestId("agent-roles")).toBeTruthy()
        expect(screen.queryAllByTestId("columns-card")).toHaveLength(0)
        expect(screen.queryByText("Chat durante a execução")).toBeNull()
        expect(screen.queryByText("Portas da prévia")).toBeNull()
        expect(screen.queryByText("Corrigir CI falho")).toBeNull()
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

    it("traz o padrão global da correção de CI (ligada, sem limite) em Configurações Padrão", () => {
        render(<AgenticTab onDirtyChange={vi.fn()} />)
        expect(screen.getByText("Corrigir CI falho")).toBeTruthy()
        expect((screen.getByLabelText("Corrigir automaticamente") as HTMLElement).getAttribute("aria-checked")).toBe("true")
        expect((screen.getByLabelText(/Máximo de correções seguidas por PR/) as HTMLInputElement).value).toBe("")
        expect(screen.queryByRole("radio", { name: "Padrão global" })).toBeNull()
    })
})
