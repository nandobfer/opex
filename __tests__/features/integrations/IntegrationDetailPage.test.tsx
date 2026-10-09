/** @vitest-environment jsdom */

import React from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { IntegrationDetailDto } from "@/features/integrations/types"

const mocks = vi.hoisted(() => ({
    useIntegration: vi.fn(),
    mutateAsync: vi.fn(),
    refresh: vi.fn(),
    debugMode: "realtime" as "realtime" | "manual",
    layoutTags: [] as string[],
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock("@/features/integrations/hooks/useIntegrationTestStream", () => ({
    useIntegrationTestStream: () => ({ state: "idle", start: vi.fn(async () => {}), cancel: vi.fn() }),
}))
vi.mock("@/features/integrations/hooks/useIntegrationStatusLive", () => ({ useIntegrationStatusLive: vi.fn() }))
vi.mock("next/link", () => ({ default: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a> }))
vi.mock("sonner", () => ({ toast: mocks.toast }))
vi.mock("@/features/integrations/hooks/useIntegrations", () => ({
    useIntegration: mocks.useIntegration,
    useUpdateIntegration: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
    integrationErrorMessage: (_e: unknown, fallback: string) => fallback,
}))
vi.mock("@/features/integrations/hooks/useIntegrationDebugLogs", () => ({
    useIntegrationDebugLogs: () => ({ mode: mocks.debugMode, loading: false, error: null, refresh: mocks.refresh }),
}))
vi.mock("@/features/integrations/components/explorer/IntegrationExplorer", () => ({
    IntegrationExplorer: ({ swaggerUrl, onBack }: { swaggerUrl: string; onBack: () => void }) => (
        <div data-testid="explorer">
            {swaggerUrl}
            <button type="button" onClick={onBack}>
                Voltar ao formulário
            </button>
        </div>
    ),
}))
vi.mock("@/features/integrations/components/IntegrationConsole", () => ({
    SEARCH_HIGHLIGHT_LIMIT: 1000,
    IntegrationConsole: React.forwardRef(function Console() {
        return <div data-testid="console" />
    }),
}))
vi.mock("framer-motion", () => {
    const MOTION_PROPS = new Set(["initial", "animate", "exit", "variants", "transition", "whileTap", "layout"])
    const passthrough = (tag: string) =>
        function Motion({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) {
            if ("layout" in props) mocks.layoutTags.push(tag)
            const domProps = Object.fromEntries(Object.entries(props).filter(([key]) => !MOTION_PROPS.has(key)))
            return React.createElement(tag, domProps, children)
        }
    return {
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        animate: () => Object.assign(Promise.resolve(), { stop: () => {} }),
        // Componente estável por tag: um novo a cada acesso remontaria a árvore a cada render.
        motion: new Proxy({} as Record<string, ReturnType<typeof passthrough>>, {
            get: (cache, tag: string) => (cache[tag] ??= passthrough(tag)),
        }),
    }
})

import { IntegrationDetailPage } from "@/features/integrations/components/IntegrationDetailPage"
import { generateApiToken } from "@/features/integrations/components/TokenField"

const detail = (overrides: Partial<IntegrationDetailDto> = {}): IntegrationDetailDto => ({
    id: "pusher",
    name: "Pusher",
    description: "Eventos em tempo real",
    environment: "externo",
    debugMode: false,
    publicValues: { mode: "cluster", appId: "app-a", key: "key", cluster: "sa1", url: null, clientKey: null, clientCluster: null, clientUrl: null },
    secrets: { secret: { configured: true, source: "db", unreadable: false } },
    encryptionKeyConfigured: true,
    stored: true,
    health: { status: "ok" },
    swaggerUrl: null,
    explorerAuth: null,
    ...overrides,
})

beforeEach(() => {
    vi.clearAllMocks()
    mocks.debugMode = "realtime"
    mocks.layoutTags = []
    mocks.useIntegration.mockReturnValue({ data: detail(), isLoading: false, isError: false })
    mocks.mutateAsync.mockImplementation(async () => detail())
})

describe("IntegrationDetailPage", () => {
    it("sem debug ligado, não há botão de testar conexão (o teste fica na barra do debug)", () => {
        render(<IntegrationDetailPage id="pusher" />)
        expect(screen.queryByRole("button", { name: /Testar conexão/ })).toBeNull()
    })

    it("rodapé: Salvar e Desfazer desabilitados sem alterações e habilitados após editar", () => {
        render(<IntegrationDetailPage id="pusher" />)
        const salvar = screen.getByRole("button", { name: /Salvar/ })
        const desfazer = screen.getByRole("button", { name: /Desfazer/ })
        expect(salvar.hasAttribute("disabled")).toBe(true)
        expect(desfazer.hasAttribute("disabled")).toBe(true)

        fireEvent.change(screen.getByLabelText(/^App ID/), { target: { value: "app-b" } })
        expect(salvar.hasAttribute("disabled")).toBe(false)

        fireEvent.click(desfazer)
        expect((screen.getByLabelText(/^App ID/) as HTMLInputElement).value).toBe("app-a")
        expect(salvar.hasAttribute("disabled")).toBe(true)
    })

    it("salvar envia somente o que mudou", async () => {
        render(<IntegrationDetailPage id="pusher" />)
        fireEvent.change(screen.getByLabelText(/^App ID/), { target: { value: "app-c" } })
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /Salvar/ }))
        })
        expect(mocks.mutateAsync).toHaveBeenCalledWith({ publicValues: { appId: "app-c" } })
    })

    it("o rodapé de edição está sempre disponível (sem permissões)", () => {
        render(<IntegrationDetailPage id="pusher" />)
        expect(screen.getByRole("button", { name: /Salvar/ })).toBeTruthy()
        expect(screen.getByRole("button", { name: /Desfazer/ })).toBeTruthy()
    })

    it("debug ligado: barra com tempo real e Atualizar, que busca os eventos novos", () => {
        mocks.useIntegration.mockReturnValue({ data: detail({ debugMode: true }), isLoading: false, isError: false })
        render(<IntegrationDetailPage id="pusher" />)
        expect(screen.getByText("Tempo real")).toBeTruthy()
        expect(screen.queryByRole("button", { name: /Recarregar/ })).toBeNull()
        fireEvent.click(screen.getByRole("button", { name: "Atualizar" }))
        expect(mocks.refresh).toHaveBeenCalled()
    })

    it("regressão: nenhum elemento da página usa projeção de layout (tela em branco ao navegar)", () => {
        mocks.useIntegration.mockReturnValue({ data: detail({ debugMode: true }), isLoading: false, isError: false })
        render(<IntegrationDetailPage id="pusher" />)
        expect(mocks.layoutTags).toEqual([])
    })

    it("debug ocupa a altura visível do contêiner rolável", () => {
        const observers: Array<() => void> = []
        vi.stubGlobal(
            "ResizeObserver",
            class {
                constructor(cb: () => void) {
                    observers.push(cb)
                }
                observe() {}
                disconnect() {}
            },
        )
        mocks.useIntegration.mockReturnValue({ data: detail({ debugMode: true }), isLoading: false, isError: false })
        const scroller = document.createElement("main")
        scroller.style.overflowY = "auto"
        scroller.style.paddingTop = "24px"
        scroller.style.paddingBottom = "24px"
        Object.defineProperty(scroller, "clientHeight", { value: 900 })
        document.body.appendChild(scroller)

        render(<IntegrationDetailPage id="pusher" />, { container: scroller.appendChild(document.createElement("div")) })
        act(() => observers.forEach((cb) => cb()))

        expect(screen.getByTestId("integration-debug-panel").style.height).toBe("852px")
        vi.unstubAllGlobals()
        scroller.remove()
    })

    it("maximizar redimensiona só o Card (o aside fica como placeholder, terminal não remonta); Esc restaura", () => {
        mocks.useIntegration.mockReturnValue({ data: detail({ debugMode: true }), isLoading: false, isError: false })
        render(<IntegrationDetailPage id="pusher" />)
        const panel = screen.getByTestId("integration-debug-panel")
        const consoleBefore = screen.getByTestId("console")

        fireEvent.click(screen.getByRole("button", { name: "Maximizar" }))
        const card = panel.firstElementChild as HTMLElement
        expect(card.style.position).toBe("fixed")
        expect(card.style.zIndex).toBe("10")
        expect(panel.style.position).toBe("")
        expect(screen.getByTestId("console")).toBe(consoleBefore)
        expect(screen.getByText("Logs")).toBeTruthy()

        act(() => (screen.getByLabelText("Buscar nos logs") as HTMLInputElement).focus())
        fireEvent.keyDown(window, { key: "Escape" })
        expect(screen.getByRole("button", { name: "Maximizar" })).toBeTruthy()
    })

    it("sem Pusher, o indicador informa que não há tempo real", () => {
        mocks.debugMode = "manual"
        mocks.useIntegration.mockReturnValue({ data: detail({ debugMode: true }), isLoading: false, isError: false })
        render(<IntegrationDetailPage id="pusher" />)
        expect(screen.getByText("Sem tempo real")).toBeTruthy()
    })
})

describe("generateApiToken", () => {
    it("gera 64 caracteres hexadecimais diferentes a cada chamada", () => {
        const a = generateApiToken()
        expect(a).toMatch(/^[0-9a-f]{64}$/)
        expect(generateApiToken()).not.toBe(a)
    })

    describe("Documentação Swagger (OpenAPI)", () => {
        const explorar = () => screen.getByRole("button", { name: /Explorar/ })

        it("campo fora dos públicos/privados, com a descrição OpenAPI 3.x; Explorar exige URL salva", () => {
            render(<IntegrationDetailPage id="pusher" />)
            expect(screen.getByText("Documentação da API")).toBeTruthy()
            expect(screen.getByText(/OpenAPI 3\.x \(JSON\).*Outros formatos não são aceitos/)).toBeTruthy()
            expect(explorar().hasAttribute("disabled")).toBe(true)
        })

        it("URL digitada e não salva: Explorar continua desabilitado e Salvar envia swaggerUrl", async () => {
            render(<IntegrationDetailPage id="pusher" />)
            fireEvent.change(screen.getByLabelText(/Documentação Swagger/), { target: { value: "https://api.exemplo.com/openapi.json" } })
            expect(explorar().hasAttribute("disabled")).toBe(true)
            await act(async () => {
                fireEvent.click(screen.getByRole("button", { name: /Salvar/ }))
            })
            expect(mocks.mutateAsync).toHaveBeenCalledWith({ swaggerUrl: "https://api.exemplo.com/openapi.json" })
        })

        it("com URL salva, Explorar fica habilitado", () => {
            mocks.useIntegration.mockReturnValue({
                data: detail({ swaggerUrl: "https://api.exemplo.com/docs" }),
                isLoading: false,
                isError: false,
            })
            render(<IntegrationDetailPage id="pusher" />)
            expect(explorar().hasAttribute("disabled")).toBe(false)
        })

        it("Explorar troca o formulário pelo explorador e Voltar restaura", () => {
            mocks.useIntegration.mockReturnValue({
                data: detail({ swaggerUrl: "https://api.exemplo.com/docs" }),
                isLoading: false,
                isError: false,
            })
            render(<IntegrationDetailPage id="pusher" />)
            fireEvent.click(explorar())
            expect(screen.getByTestId("explorer").textContent).toContain("https://api.exemplo.com/docs")
            expect(screen.queryByText("Documentação da API")).toBeNull()
            fireEvent.click(screen.getByRole("button", { name: "Voltar ao formulário" }))
            expect(screen.queryByTestId("explorer")).toBeNull()
            expect(screen.getByText("Documentação da API")).toBeTruthy()
        })
    })
})
