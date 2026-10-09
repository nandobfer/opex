/** @vitest-environment jsdom */

import React from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { AxiosError } from "axios"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { GoSipalSessionDto } from "@/features/go-sipal/session/types"

const mocks = vi.hoisted(() => ({
    session: null as unknown,
    send: vi.fn(),
    verify: vi.fn(),
    cancel: vi.fn(),
    disconnect: vi.fn(),
}))

vi.mock("framer-motion", async () => (await import("../../helpers/framer-motion")).framerMotionMock())
vi.mock("@/features/integrations/hooks/useIntegrationTestStream", () => ({
    useIntegrationTestStream: () => ({ state: "idle", start: vi.fn(), cancel: vi.fn() }),
}))
vi.mock("@/features/go-sipal/hooks/useGoSipalSession", () => ({
    useGoSipalSession: () => ({ data: mocks.session, isLoading: false, isError: false, refetch: vi.fn() }),
    useGoSipalSessionLive: vi.fn(),
    useSendGoSipalCode: () => ({ mutate: mocks.send, isPending: false }),
    useVerifyGoSipalCode: () => ({ mutateAsync: mocks.verify, isPending: false }),
    useCancelGoSipalCode: () => ({ mutate: mocks.cancel, isPending: false }),
    useDisconnectGoSipal: () => ({ mutate: mocks.disconnect, isPending: false }),
}))

import { GoSipalSessionCard } from "@/features/go-sipal/components/GoSipalSessionCard"

const base: GoSipalSessionDto = {
    status: "disconnected",
    email: "fer@sipal.com.br",
    baseUrl: "https://go.sipal.com.br",
    warningDays: 3,
    user: null,
    connectedAt: null,
    expiresAt: null,
    daysLeft: null,
    pending: null,
}

const renderCard = (session: Partial<GoSipalSessionDto>, dirty = false) => {
    mocks.session = { ...base, ...session }
    // Sem TooltipProvider em volta, como na página real (regressão: o card quebrava sem ele).
    return render(<GoSipalSessionCard dirty={dirty} />)
}

const pending = (offsetMs = 0) => {
    const at = Date.now() - offsetMs
    return {
        email: "fer@sipal.com.br",
        requestedAt: new Date(at).toISOString(),
        codeExpiresAt: new Date(at + 15 * 60_000).toISOString(),
        resendAvailableAt: new Date(at + 60_000).toISOString(),
        expired: false,
    }
}

beforeEach(() => vi.clearAllMocks())

describe("GoSipalSessionCard", () => {
    it("desconectado: envia o código para o e-mail salvo", () => {
        renderCard({})
        expect(screen.getByText("fer@sipal.com.br")).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: /Enviar código/ }))
        expect(mocks.send).toHaveBeenCalledTimes(1)
    })

    it("com alterações não salvas ou sem e-mail, não envia", () => {
        renderCard({}, true)
        expect(screen.getByRole("button", { name: /Enviar código/ }).hasAttribute("disabled")).toBe(true)
    })

    it("aguardando código: confirma sozinho ao completar 6 dígitos (aceita colar com espaços)", async () => {
        mocks.verify.mockResolvedValue({})
        renderCard({ pending: pending() })
        expect(screen.getByRole("button", { name: /Reenviar em/ }).hasAttribute("disabled")).toBe(true)
        await act(async () => {
            fireEvent.change(screen.getByLabelText("Código de acesso"), { target: { value: "12 34 56" } })
        })
        expect(mocks.verify).toHaveBeenCalledWith("123456")
    })

    it("código recusado mostra o erro e limpa o campo", async () => {
        mocks.verify.mockRejectedValue(
            new AxiosError("400", "ERR_BAD_REQUEST", undefined, undefined, { data: { success: false, error: "Código inválido" } } as never),
        )
        renderCard({ pending: pending(2 * 60_000) })
        expect(screen.getByRole("button", { name: "Reenviar código" }).hasAttribute("disabled")).toBe(false)
        const input = screen.getByLabelText("Código de acesso") as HTMLInputElement
        await act(async () => {
            fireEvent.change(input, { target: { value: "000000" } })
        })
        expect(screen.getByRole("alert").textContent).toBe("Código inválido")
        expect((screen.getByLabelText("Código de acesso") as HTMLInputElement).value).toBe("")
    })

    it("conectado: mostra usuário, perfil e expiração; perto de expirar destaca", () => {
        renderCard({
            status: "expiring",
            user: { name: "Fernando", email: "fer@sipal.com.br", userType: "operador", isDeveloper: true, isDevLeader: false },
            expiresAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
            daysLeft: 2,
            connectedAt: new Date().toISOString(),
        })
        expect(screen.getByText("Fernando")).toBeTruthy()
        expect(screen.getByText("Desenvolvedor")).toBeTruthy()
        expect(screen.getByText(/faltam 2 dias/).className).toContain("text-warning")
        expect(screen.getByRole("button", { name: /Entrar novamente/ })).toBeTruthy()
    })

    it("desconectar pede confirmação", () => {
        renderCard({ status: "connected", user: { name: "F", email: null, userType: null, isDeveloper: false, isDevLeader: false } })
        expect(screen.getByText("Sem acesso ao Centro de Desenvolvimento")).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: /Desconectar/ }))
        expect(mocks.disconnect).not.toHaveBeenCalled()
        fireEvent.click(screen.getAllByRole("button", { name: "Desconectar" }).at(-1)!)
        expect(mocks.disconnect).toHaveBeenCalledTimes(1)
    })
})
