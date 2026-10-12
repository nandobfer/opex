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

function fillCredentials(password = "senha-secreta") {
    fireEvent.change(screen.getByLabelText("Usuário ou email"), { target: { value: "fernando" } })
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: password } })
}

describe("formulário de login", () => {
    it("exige identificador e senha e não chama a API com os campos vazios", async () => {
        render(<LoginForm />, { wrapper: Wrapper })
        fireEvent.click(screen.getByRole("button", { name: "Entrar" }))
        expect(await screen.findAllByRole("alert")).not.toHaveLength(0)
        expect(mocks.post).not.toHaveBeenCalled()
    })

    it("envia as credenciais e navega para a página inicial ao entrar", async () => {
        mocks.post.mockResolvedValue({ data: { success: true, data: { authenticated: true } } })
        render(<LoginForm />, { wrapper: Wrapper })

        fillCredentials()
        fireEvent.click(screen.getByRole("button", { name: "Entrar" }))

        await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/auth/login", { identifier: "fernando", password: "senha-secreta" }))
        await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(HOME_HREF))
    })

    it("usa o destino do servidor (usuário de cliente vai para o portal)", async () => {
        mocks.post.mockResolvedValue({ data: { success: true, data: { authenticated: true, redirectTo: "/cliente" } } })
        render(<LoginForm />, { wrapper: Wrapper })

        fillCredentials()
        fireEvent.click(screen.getByRole("button", { name: "Entrar" }))

        await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/cliente"))
    })

    it("respeita o destino informado em next", async () => {
        mocks.post.mockResolvedValue({ data: { success: true, data: { authenticated: true, redirectTo: "/dashboard" } } })
        render(<LoginForm nextPath="/integracoes" />, { wrapper: Wrapper })

        fillCredentials("senha")
        fireEvent.click(screen.getByRole("button", { name: "Entrar" }))

        await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/integracoes"))
    })

    it("ignora destino externo (open redirect) e cai no destino do servidor", async () => {
        mocks.post.mockResolvedValue({ data: { success: true, data: { authenticated: true, redirectTo: "/dashboard" } } })
        render(<LoginForm nextPath="//evil.example" />, { wrapper: Wrapper })

        fillCredentials("senha")
        fireEvent.click(screen.getByRole("button", { name: "Entrar" }))

        await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(HOME_HREF))
    })

    it("mostra erro quando as credenciais são recusadas e não navega", async () => {
        mocks.post.mockRejectedValue(new Error("401"))
        render(<LoginForm />, { wrapper: Wrapper })

        fillCredentials("errada")
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
