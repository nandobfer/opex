/** @vitest-environment happy-dom */
import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"
import type { McpOauthAttemptDto, OpencodeResourceDto } from "@/features/opencode-resources/types"

/** Telas do OAuth dos MCPs do OpenCode (OPE-176): selo/menu na linha e o diálogo Autorizar. */

const mocks = vi.hoisted(() => ({
    start: vi.fn(),
    startState: { data: undefined as unknown, isError: false, error: null as unknown },
    status: { data: { status: "pending", message: null } as unknown, isError: false, error: null },
    complete: vi.fn(),
    cancel: vi.fn(),
}))
vi.mock("framer-motion", () => framerMotionMock())
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/features/opencode-resources/hooks/useMcpOauth", () => ({
    useStartMcpOauth: () => ({ mutate: mocks.start, isPending: false, ...mocks.startState }),
    useMcpOauthStatus: () => mocks.status,
    useCompleteMcpOauth: () => ({ mutate: mocks.complete, isPending: false, data: undefined }),
    useCancelMcpOauth: () => ({ mutate: mocks.cancel }),
    useDisconnectMcpOauth: () => ({ mutate: vi.fn(), isPending: false }),
}))

import { McpAuthorizeDialog } from "@/features/opencode-resources/components/McpAuthorizeDialog"
import { ResourceRow, type ResourceRowActions } from "@/features/opencode-resources/components/ResourceRow"

const MCP: OpencodeResourceDto = {
    id: "mcp-1",
    kind: "mcp",
    name: "linear",
    description: "https://mcp.linear.app/mcp",
    scope: "global",
    scopeLabel: "Global",
    origin: "config",
    source: null,
    path: null,
    enabled: true,
    builtin: false,
    editable: true,
    removable: true,
    version: null,
    status: { state: "needs_auth", error: "requires a login" },
    authorization: { state: "needs_auth", error: "requires a login" },
    tags: ["remoto"],
}

const ATTEMPT: McpOauthAttemptDto = { attemptId: "att-1", url: "https://mcp.linear.app/authorize?x=1", instructions: "Authorize", mode: "auto", expiresAt: Date.now() + 60_000, localCallback: true }

const actions = (): ResourceRowActions => ({ onToggle: vi.fn(), onEdit: vi.fn(), onRemove: vi.fn(), onUpdate: vi.fn(), onTest: vi.fn(), onAuthorize: vi.fn(), onDisconnectOauth: vi.fn() })

beforeEach(() => {
    vi.clearAllMocks()
    mocks.startState = { data: ATTEMPT, isError: false, error: null }
    mocks.status = { data: { status: "pending", message: null }, isError: false, error: null }
})
afterEach(cleanup)

describe("linha do MCP com OAuth", () => {
    it("mostra o selo da autorização e oferece Autorizar no menu", async () => {
        const handlers = actions()
        render(<ResourceRow item={MCP} actions={handlers} />)
        expect(screen.getByText("OAuth · Precisa autorizar")).toBeTruthy()
        fireEvent.pointerDown(screen.getByRole("button", { name: /Ações|Mais ações|menu/i }), { button: 0, pointerType: "mouse" })
        fireEvent.click(await screen.findByText("Autorizar"))
        expect(handlers.onAuthorize).toHaveBeenCalledWith(MCP)
    })

    it("MCP sem OAuth não mostra selo de autorização", () => {
        render(<ResourceRow item={{ ...MCP, status: { state: "connected", error: null }, authorization: { state: "not_required", error: null } }} actions={actions()} />)
        expect(screen.queryByText(/OAuth ·/)).toBeNull()
    })
})

describe("diálogo Autorizar", () => {
    it("inicia a tentativa, abre a página do provedor e conclui colando a URL de retorno", async () => {
        render(<McpAuthorizeDialog target={MCP} onClose={vi.fn()} />)
        expect(mocks.start).toHaveBeenCalledWith("mcp-1")
        expect(screen.getByRole("link", { name: /Abrir página de autorização/ }).getAttribute("href")).toBe(ATTEMPT.url)
        const field = screen.getByLabelText(/Cole a URL da barra de endereço/)
        fireEvent.change(field, { target: { value: "http://127.0.0.1:36113/callback?code=c&state=s" } })
        await waitFor(() => expect((screen.getByRole("button", { name: "Concluir" }) as HTMLButtonElement).disabled).toBe(false))
        fireEvent.click(screen.getByRole("button", { name: "Concluir" }))
        await waitFor(() => expect(mocks.complete).toHaveBeenCalledWith({ id: "mcp-1", attemptId: "att-1", input: { callbackUrl: "http://127.0.0.1:36113/callback?code=c&state=s" } }))
    })

    it("cancelar com o login pendente cancela a tentativa no OpenCode", () => {
        const onClose = vi.fn()
        render(<McpAuthorizeDialog target={MCP} onClose={onClose} />)
        fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
        expect(mocks.cancel).toHaveBeenCalledWith({ id: "mcp-1", attemptId: "att-1" })
        expect(onClose).toHaveBeenCalled()
    })

    it("concluído fecha o diálogo; falha ao iniciar mostra erro com tentar novamente", () => {
        const onClose = vi.fn()
        mocks.status = { data: { status: "complete", message: null }, isError: false, error: null }
        render(<McpAuthorizeDialog target={MCP} onClose={onClose} />)
        expect(onClose).toHaveBeenCalled()
        cleanup()
        mocks.startState = { data: undefined, isError: true, error: new Error("x") }
        render(<McpAuthorizeDialog target={MCP} onClose={vi.fn()} />)
        fireEvent.click(screen.getByRole("button", { name: /Tentar novamente/ }))
        expect(mocks.start).toHaveBeenCalledTimes(3)
    })
})
