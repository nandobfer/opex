/** @vitest-environment happy-dom */
import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../../helpers/framer-motion"
import type { OpencodeAuthProviderDto, OpencodeLoginStatusDto } from "@/features/opencode-accounts/types"

const mocks = vi.hoisted(() => ({ connectKey: vi.fn(), startOauth: vi.fn(), complete: vi.fn(), startCommand: vi.fn(), status: vi.fn(), cancel: vi.fn() }))
vi.mock("framer-motion", () => framerMotionMock())
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/features/opencode-accounts/hooks/useOpencodeAccounts", () => {
    const mutation = (fn: ReturnType<typeof vi.fn>) => ({ mutateAsync: fn, isPending: false })
    return {
        useConnectOpencodeKey: () => mutation(mocks.connectKey),
        useStartOpencodeOauth: () => mutation(mocks.startOauth),
        useCompleteOpencodeOauth: () => mutation(mocks.complete),
        useStartOpencodeCommand: () => mutation(mocks.startCommand),
        useOpencodeLoginStatus: mocks.status,
        cancelOpencodeLogin: mocks.cancel,
    }
})

import { AddAccountDialog } from "@/features/opencode-accounts/components/AddAccountDialog"

const provider: OpencodeAuthProviderDto = {
    id: "github-copilot",
    name: "GitHub Copilot",
    providers: [],
    methods: [
        { kind: "key", id: "key", label: "Chave de API", fields: [] },
        { kind: "oauth", id: "device", label: "Login com GitHub", fields: [] },
        { kind: "oauth", id: "paste", label: "Login com código", fields: [] },
        { kind: "command", id: "gh", label: "Usar o gh", command: ["gh", "auth", "token"] },
    ],
    envNames: [],
    accounts: [],
    envConnections: [],
    activeAccountId: null,
    connected: false,
}

const onClose = vi.fn()
const open = () => render(<AddAccountDialog provider={provider} onClose={onClose} />)
const pick = (label: string) => fireEvent.click(screen.getAllByText(label)[0]!)
const clickWhenEnabled = async (name: string) => {
    const button = () => screen.getByRole("button", { name }) as HTMLButtonElement
    await waitFor(() => expect(button().disabled).toBe(false))
    fireEvent.click(button())
}

beforeEach(() => {
    vi.clearAllMocks()
    mocks.status.mockReturnValue({ data: { status: "pending", message: null } satisfies OpencodeLoginStatusDto, isError: false })
})
afterEach(cleanup)

describe("Adicionar conta", () => {
    it("por chave: campo mascarado e envio com o nome", async () => {
        mocks.connectKey.mockResolvedValue({ connected: true })
        open()
        pick("Chave de API")
        const key = screen.getByLabelText("Chave de API *") as HTMLInputElement
        expect(key.type).toBe("password")
        fireEvent.change(screen.getByLabelText("Nome da conta (opcional)"), { target: { value: "Pessoal" } })
        fireEvent.change(key, { target: { value: "sk-1" } })
        await waitFor(() => expect((screen.getByRole("button", { name: "Adicionar conta" }) as HTMLButtonElement).disabled).toBe(false))
        fireEvent.click(screen.getByRole("button", { name: "Adicionar conta" }))
        await waitFor(() => expect(mocks.connectKey).toHaveBeenCalledWith({ integrationId: "github-copilot", input: { key: "sk-1", label: "Pessoal", answer: undefined } }))
        await waitFor(() => expect(onClose).toHaveBeenCalled())
        expect(mocks.cancel).not.toHaveBeenCalled()
    })

    it("OAuth modo código: abre a página e conclui com o código colado", async () => {
        mocks.startOauth.mockResolvedValue({ attemptId: "att_1", url: "https://claude.ai/oauth", instructions: "Cole o código", mode: "code", expiresAt: 1 })
        mocks.complete.mockResolvedValue({ connected: true })
        open()
        pick("Login com código")
        await clickWhenEnabled("Continuar")
        await screen.findByLabelText("Código de autorização")
        expect(screen.getByRole("link", { name: /Abrir página de login/ }).getAttribute("href")).toBe("https://claude.ai/oauth")
        fireEvent.change(screen.getByLabelText("Código de autorização"), { target: { value: "abc#123" } })
        await waitFor(() => expect((screen.getByRole("button", { name: "Concluir" }) as HTMLButtonElement).disabled).toBe(false))
        fireEvent.click(screen.getByRole("button", { name: "Concluir" }))
        await waitFor(() => expect(mocks.complete).toHaveBeenCalledWith({ integrationId: "github-copilot", attemptId: "att_1", code: "abc#123" }))
    })

    it("OAuth automático: mostra o código do dispositivo e fecha cancelando se o usuário desistir", async () => {
        mocks.startOauth.mockResolvedValue({ attemptId: "att_2", url: "https://github.com/login/device", instructions: "Enter code: AB-12", mode: "auto", expiresAt: 1 })
        open()
        pick("Login com GitHub")
        await clickWhenEnabled("Continuar")
        await screen.findByText("Enter code: AB-12")
        expect(screen.getByText(/Aguardando você concluir o login/)).toBeTruthy()
        expect(mocks.status).toHaveBeenLastCalledWith("oauth", "github-copilot", "att_2")
        fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
        expect(mocks.cancel).toHaveBeenCalledWith("oauth", "github-copilot", "att_2")
        expect(onClose).toHaveBeenCalled()
    })

    it("por comando: acompanha o status até concluir", async () => {
        mocks.startCommand.mockResolvedValue({ attemptId: "att_3", expiresAt: 1 })
        const view = open()
        pick("Usar o gh")
        expect(screen.getByText("gh auth token")).toBeTruthy()
        await clickWhenEnabled("Continuar")
        await screen.findByText(/Executando "Usar o gh"/)
        expect(mocks.status).toHaveBeenLastCalledWith("command", "github-copilot", "att_3")
        expect(onClose).not.toHaveBeenCalled()
        mocks.status.mockReturnValue({ data: { status: "complete", message: null }, isError: false })
        view.rerender(<AddAccountDialog provider={provider} onClose={onClose} />)
        await waitFor(() => expect(onClose).toHaveBeenCalled())
        expect(mocks.cancel).not.toHaveBeenCalled()
    })
})
