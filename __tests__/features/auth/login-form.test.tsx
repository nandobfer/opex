/** @vitest-environment jsdom */

import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const mocks = vi.hoisted(() => ({
    replace: vi.fn(),
    refresh: vi.fn(),
    post: vi.fn(),
    toastError: vi.fn(),
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }))
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: vi.fn() }, Toaster: () => null }))
vi.mock("@/lib/api", async (original) => {
    const actual = await original<typeof import("@/lib/api")>()
    return { ...actual, api: { post: mocks.post } }
})

import { LoginForm } from "@/features/auth/components/LoginForm"
import { HOME_HREF } from "@/features/layout/navigation"

function Wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe("formulário de login", () => {
    it("exige a senha e não chama a API com o campo vazio", async () => {
        render(<LoginForm />, { wrapper: Wrapper })
        fireEvent.click(screen.getByRole("button", { name: "Entrar" }))
        expect(await screen.findByRole("alert")).toBeTruthy()
        expect(mocks.post).not.toHaveBeenCalled()
    })

    it("envia a senha e navega para a página inicial ao entrar", async () => {
        mocks.post.mockResolvedValue({ data: { success: true, data: { authenticated: true } } })
        render(<LoginForm />, { wrapper: Wrapper })

        fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "senha-secreta" } })
        fireEvent.click(screen.getByRole("button", { name: "Entrar" }))

        await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/auth/login", { password: "senha-secreta" }))
        await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(HOME_HREF))
    })

    it("respeita o destino informado em next", async () => {
        mocks.post.mockResolvedValue({ data: { success: true, data: { authenticated: true } } })
        render(<LoginForm nextPath="/integracoes" />, { wrapper: Wrapper })

        fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "senha" } })
        fireEvent.click(screen.getByRole("button", { name: "Entrar" }))

        await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/integracoes"))
    })

    it("ignora destino externo (open redirect) e cai na página inicial", async () => {
        mocks.post.mockResolvedValue({ data: { success: true, data: { authenticated: true } } })
        render(<LoginForm nextPath="//evil.example" />, { wrapper: Wrapper })

        fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "senha" } })
        fireEvent.click(screen.getByRole("button", { name: "Entrar" }))

        await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(HOME_HREF))
    })

    it("mostra erro quando a senha é recusada e não navega", async () => {
        mocks.post.mockRejectedValue(new Error("401"))
        render(<LoginForm />, { wrapper: Wrapper })

        fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "errada" } })
        fireEvent.click(screen.getByRole("button", { name: "Entrar" }))

        await waitFor(() => expect(mocks.toastError).toHaveBeenCalled())
        expect(mocks.replace).not.toHaveBeenCalled()
    })

    it("permite revelar e ocultar a senha", () => {
        render(<LoginForm />, { wrapper: Wrapper })
        const input = screen.getByLabelText("Senha")
        expect(input.getAttribute("type")).toBe("password")

        fireEvent.click(screen.getByRole("button", { name: "Mostrar senha" }))
        expect(input.getAttribute("type")).toBe("text")

        fireEvent.click(screen.getByRole("button", { name: "Ocultar senha" }))
        expect(input.getAttribute("type")).toBe("password")
    })
})
