/** @vitest-environment happy-dom */

import type { ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { framerMotionMock } from "../../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())
// O fundo é client-only (`dynamic(..., { ssr: false })`): nos testes basta um stub.
vi.mock("next/dynamic", () => ({ default: () => () => null }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() }, Toaster: () => null }))
vi.mock("@/lib/api", async (original) => {
    const actual = await original<typeof import("@/lib/api")>()
    return { ...actual, api: { post: vi.fn() } }
})

import { LoginPage } from "@/features/auth/components/LoginPage"

function Wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

afterEach(cleanup)

describe("tela de login", () => {
    it("mostra o título e o subtítulo com a fonte destacada", () => {
        render(<LoginPage />, { wrapper: Wrapper })

        const title = screen.getByRole("heading", { level: 1 })
        expect(title.textContent).toBe("Opex")
        expect(title.classList.contains("text-5xl")).toBe(true)
        expect(title.classList.contains("sm:text-6xl")).toBe(true)

        const subtitle = screen.getByText("nandoburgos.dev")
        expect(subtitle.classList.contains("text-base")).toBe(true)
        expect(subtitle.classList.contains("sm:text-lg")).toBe(true)
    })

    it("não tem logo nem o aviso de acesso restrito", () => {
        render(<LoginPage />, { wrapper: Wrapper })

        expect(screen.queryByText("O", { exact: true })).toBeNull()
        expect(screen.queryByText(/Acesso restrito/)).toBeNull()
    })

    it("mantém o campo Senha para entrar", () => {
        render(<LoginPage />, { wrapper: Wrapper })
        expect(screen.getByLabelText("Senha")).toBeTruthy()
    })
})
