/** @vitest-environment happy-dom */
import '../../helpers/integrations-render'


import React from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { IntegrationDetailDto } from "@nandobfer/integracoes/modules/core/dto"

const mocks = vi.hoisted(() => ({
    useIntegration: vi.fn(),
    mutateAsync: vi.fn(),
    refresh: vi.fn(),
    debugMode: "realtime" as "realtime" | "manual",
    layoutTags: [] as string[],
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock("@nandobfer/integracoes/modules/react/hooks/useIntegrationTestStream", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...((await (() => ({
    useIntegrationTestStream: () => ({ state: "idle", start: vi.fn(async () => {}), cancel: vi.fn() }),
}))(importOriginal)) as Record<string, unknown>), }))
vi.mock("@nandobfer/integracoes/modules/react/hooks/useIntegrationStatusLive", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...((await (() => ({ useIntegrationStatusLive: vi.fn() }))(importOriginal)) as Record<string, unknown>), }))
vi.mock("next/link", () => ({ default: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a> }))
vi.mock("sonner", () => ({ toast: mocks.toast }))
vi.mock("@nandobfer/integracoes/modules/react/hooks/useIntegrations", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...((await (() => ({
    useIntegration: mocks.useIntegration,
    useUpdateIntegration: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
    integrationErrorMessage: (_e: unknown, fallback: string) => fallback,
}))(importOriginal)) as Record<string, unknown>), }))
vi.mock("@nandobfer/integracoes/modules/react/hooks/useIntegrationDebugLogs", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...((await (() => ({
    useIntegrationDebugLogs: () => ({ mode: mocks.debugMode, loading: false, error: null, refresh: mocks.refresh }),
}))(importOriginal)) as Record<string, unknown>), }))
vi.mock("@nandobfer/integracoes/modules/react/central/explorer/IntegrationExplorer", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...((await (() => ({
    IntegrationExplorer: ({ swaggerUrl, onBack }: { swaggerUrl: string; onBack: () => void }) => (
        <div data-testid="explorer">
            {swaggerUrl}
            <button type="button" onClick={onBack}>
                Voltar ao formulário
            </button>
        </div>
    ),
}))(importOriginal)) as Record<string, unknown>), }))
vi.mock("@nandobfer/integracoes/modules/react/central/IntegrationConsole", async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), ...((await (() => ({
    SEARCH_HIGHLIGHT_LIMIT: 1000,
    IntegrationConsole: React.forwardRef(function Console() {
        return <div data-testid="console" />
    }),
}))(importOriginal)) as Record<string, unknown>), }))
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

import { IntegrationDetailPage } from "@nandobfer/integracoes/modules/react/central/IntegrationDetailPage"
import { generateApiToken } from "@nandobfer/integracoes/modules/react/central/TokenField"
import { DEBUG_DIALOG_MEDIA_QUERY } from "@nandobfer/integracoes/modules/react/central/detail/debug-toggle-context"

const detail = (overrides: Partial<IntegrationDetailDto> = {}): IntegrationDetailDto => ({
    id: "pusher",
    name: "Pusher",
    description: "Eventos em tempo real",
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
    vi.unstubAllGlobals()
    stubViewport(false)
    mocks.useIntegration.mockReturnValue({ data: detail(), isLoading: false, isError: false })
    mocks.mutateAsync.mockImplementation(async () => detail())
})

/** Tela larga ou estreita: o happy-dom tem `matchMedia` de verdade (janela de 1024 px, abaixo de `xl`). */
const stubViewport = (narrow: boolean) =>
    vi.stubGlobal("matchMedia", (query: string) => ({
        matches: narrow && query === DEBUG_DIALOG_MEDIA_QUERY,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
    }))

const openDebug = () => fireEvent.click(screen.getByRole("button", { name: "Abrir logs de debug" }))

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

    it("integração genérica (Storage S3) desenha os campos do catálogo e envia só o que mudou", async () => {
        mocks.useIntegration.mockReturnValue({
            data: detail({
                id: "storage_s3",
                name: "Storage S3",
                publicValues: { endpoint: "http://minio:9000", publicEndpoint: null, region: "us-east-1", bucket: "default", signedUrlExpiresSeconds: 3600 },
                secrets: {
                    accessKey: { configured: true, source: "db", unreadable: false },
                    secretKey: { configured: true, source: "db", unreadable: false },
                },
            }),
            isLoading: false,
            isError: false,
        })
        render(<IntegrationDetailPage id="storage_s3" />)
        expect(screen.getByText("Storage S3")).toBeTruthy()
        fireEvent.change(screen.getByLabelText(/^Bucket/), { target: { value: "arquivos" } })
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /Salvar/ }))
        })
        expect(mocks.mutateAsync).toHaveBeenCalledWith({ publicValues: { bucket: "arquivos" } })
    })

    it("o rodapé de edição está sempre disponível (sem permissões)", () => {
        render(<IntegrationDetailPage id="pusher" />)
        expect(screen.getByRole("button", { name: /Salvar/ })).toBeTruthy()
        expect(screen.getByRole("button", { name: /Desfazer/ })).toBeTruthy()
    })

    it("logs: barra com tempo real e Atualizar, que busca os eventos novos", () => {
        mocks.useIntegration.mockReturnValue({ data: detail(), isLoading: false, isError: false })
        render(<IntegrationDetailPage id="pusher" />)
        openDebug()
        expect(screen.getByText("Tempo real")).toBeTruthy()
        expect(screen.queryByRole("button", { name: /Recarregar/ })).toBeNull()
        fireEvent.click(screen.getByRole("button", { name: "Atualizar" }))
        expect(mocks.refresh).toHaveBeenCalled()
    })

    it("regressão: nenhum elemento da página usa projeção de layout (tela em branco ao navegar)", () => {
        mocks.useIntegration.mockReturnValue({ data: detail(), isLoading: false, isError: false })
        render(<IntegrationDetailPage id="pusher" />)
        openDebug()
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
        mocks.useIntegration.mockReturnValue({ data: detail(), isLoading: false, isError: false })
        const scroller = document.createElement("main")
        scroller.style.overflowY = "auto"
        scroller.style.paddingTop = "24px"
        scroller.style.paddingBottom = "24px"
        Object.defineProperty(scroller, "clientHeight", { value: 900 })
        document.body.appendChild(scroller)

        render(<IntegrationDetailPage id="pusher" />, { container: scroller.appendChild(document.createElement("div")) })
        openDebug()
        act(() => observers.forEach((cb) => cb()))

        expect(screen.getByTestId("integration-debug-panel").style.height).toBe("852px")
        vi.unstubAllGlobals()
        scroller.remove()
    })

    it("maximizar redimensiona só o Card (o aside fica como placeholder, terminal não remonta); Esc restaura", () => {
        mocks.useIntegration.mockReturnValue({ data: detail(), isLoading: false, isError: false })
        render(<IntegrationDetailPage id="pusher" />)
        openDebug()
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
        mocks.useIntegration.mockReturnValue({ data: detail(), isLoading: false, isError: false })
        render(<IntegrationDetailPage id="pusher" />)
        openDebug()
        expect(screen.getByText("Sem tempo real")).toBeTruthy()
    })

    describe("botão de debug no título (OPE-169)", () => {
        const debugOn = () => mocks.useIntegration.mockReturnValue({ data: detail(), isLoading: false, isError: false })

        it("o debug é sempre ativo: o botão aparece sem ligar nada e a coluna começa fechada", () => {
            render(<IntegrationDetailPage id="pusher" />)
            expect(screen.getByRole("button", { name: "Abrir logs de debug" }).getAttribute("aria-expanded")).toBe("false")
            expect(screen.queryByTestId("integration-debug-panel")).toBeNull()
            expect(screen.queryByText(/Modo debug/)).toBeNull()
            expect(screen.queryByText("Ambiente")).toBeNull()
        })

        it("a coluna começa fechada e o botão alterna abrir/fechar com aria-expanded e aria-controls", () => {
            debugOn()
            const { container } = render(<IntegrationDetailPage id="pusher" />)
            const button = screen.getByRole("button", { name: "Abrir logs de debug" })
            expect(button.getAttribute("aria-expanded")).toBe("false")
            expect(screen.queryByTestId("integration-debug-panel")).toBeNull()
            expect(container.querySelector(".xl\\:grid-cols-\\[minmax\\(0\\,1fr\\)_minmax\\(0\\,1fr\\)\\]")).toBeNull()

            fireEvent.click(button)
            const panel = screen.getByTestId("integration-debug-panel")
            const toggle = screen.getByRole("button", { name: "Fechar logs de debug" })
            expect(toggle.getAttribute("aria-expanded")).toBe("true")
            expect(toggle.getAttribute("aria-controls")).toBe(panel.id)
            expect(panel.id).not.toBe("")
            expect((panel.parentElement as HTMLElement).className).toContain("xl:grid-cols-")

            fireEvent.click(toggle)
            expect(screen.queryByTestId("integration-debug-panel")).toBeNull()
            expect(screen.getByRole("button", { name: "Abrir logs de debug" }).getAttribute("aria-expanded")).toBe("false")
            expect(mocks.mutateAsync).not.toHaveBeenCalled()
        })

        it("o Fechar (X) da barra do console fecha a coluna", () => {
            debugOn()
            render(<IntegrationDetailPage id="pusher" />)
            openDebug()
            fireEvent.click(screen.getByRole("button", { name: "Fechar" }))
            expect(screen.queryByTestId("integration-debug-panel")).toBeNull()
            expect(screen.getByRole("button", { name: "Abrir logs de debug" })).toBeTruthy()
        })

        it("regressão: fechar maximizado devolve a tela ao normal", () => {
            debugOn()
            render(<IntegrationDetailPage id="pusher" />)
            openDebug()
            fireEvent.click(screen.getByRole("button", { name: "Maximizar" }))
            const card = screen.getByTestId("integration-debug-panel").firstElementChild as HTMLElement
            expect(card.style.position).toBe("fixed")

            fireEvent.click(screen.getByRole("button", { name: "Fechar" }))
            openDebug()
            expect(screen.getByRole("button", { name: "Maximizar" })).toBeTruthy()
            const reopened = screen.getByTestId("integration-debug-panel").firstElementChild as HTMLElement
            expect(reopened.style.position).toBe("")
        })

        it("salvar de novo (detalhe atualizado) não fecha a coluna aberta", () => {
            debugOn()
            const { rerender } = render(<IntegrationDetailPage id="pusher" />)
            openDebug()
            expect(screen.getByTestId("integration-debug-panel")).toBeTruthy()

            mocks.useIntegration.mockReturnValue({ data: detail({ updatedAt: "2026-11-28T00:00:00.000Z" }), isLoading: false, isError: false })
            rerender(<IntegrationDetailPage id="pusher" />)
            expect(screen.getByTestId("integration-debug-panel")).toBeTruthy()
            expect(screen.getByRole("button", { name: "Fechar logs de debug" }).getAttribute("aria-expanded")).toBe("true")
        })

        it("trocar de integração com os logs abertos volta para fechado", () => {
            debugOn()
            const { rerender } = render(<IntegrationDetailPage id="pusher" />)
            openDebug()
            expect(screen.getByTestId("integration-debug-panel")).toBeTruthy()

            mocks.useIntegration.mockReturnValue({
                data: detail({
                    id: "storage_s3",
                    name: "Storage S3",
                    publicValues: { endpoint: "http://minio:9000", publicEndpoint: null, region: "us-east-1", bucket: "default", signedUrlExpiresSeconds: 3600 },
                    secrets: {
                        accessKey: { configured: true, source: "db", unreadable: false },
                        secretKey: { configured: true, source: "db", unreadable: false },
                    },
                }),
                isLoading: false,
                isError: false,
            })
            rerender(<IntegrationDetailPage id="storage_s3" />)
            expect(screen.getByText("Storage S3")).toBeTruthy()
            expect(screen.queryByTestId("integration-debug-panel")).toBeNull()
            expect(screen.getByRole("button", { name: "Abrir logs de debug" }).getAttribute("aria-expanded")).toBe("false")
        })

        it("tela estreita: o botão abre a janela de logs (sem coluna) e fechar a janela volta o botão", () => {
            stubViewport(true)
            debugOn()
            render(<IntegrationDetailPage id="pusher" />)
            openDebug()
            expect(screen.queryByTestId("integration-debug-panel")).toBeNull()
            const dialog = screen.getByRole("dialog")
            expect(dialog.textContent).toContain("Logs — Pusher")
            expect(screen.queryByRole("button", { name: "Maximizar" })).toBeNull()

            fireEvent.click(screen.getByRole("button", { name: "Fechar" }))
            expect(screen.queryByRole("dialog")).toBeNull()
            expect(screen.getByRole("button", { name: "Abrir logs de debug" }).getAttribute("aria-expanded")).toBe("false")
        })
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
