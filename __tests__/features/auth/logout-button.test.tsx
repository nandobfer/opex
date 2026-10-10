/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ post: vi.fn() }))

vi.mock("@/lib/api", async (original) => {
    const actual = await original<typeof import("@/lib/api")>()
    return { ...actual, api: { post: mocks.post } }
})

import { LogoutButton } from "@/features/auth/components/LogoutButton"

const originalLocation = window.location

beforeEach(() => {
    mocks.post.mockResolvedValue({ data: { success: true, data: { authenticated: false } } })
})

afterEach(() => {
    cleanup()
    Object.defineProperty(window, "location", { configurable: true, writable: true, value: originalLocation })
})

function stubLocation() {
    const assign = vi.fn()
    Object.defineProperty(window, "location", { configurable: true, writable: true, value: { assign } })
    return assign
}

describe("botão Sair", () => {
    it("encerra a sessão e volta para a tela de login", async () => {
        const assign = stubLocation()
        render(<LogoutButton />)

        fireEvent.click(screen.getByRole("button", { name: "Sair" }))

        await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/auth/logout"))
        await waitFor(() => expect(assign).toHaveBeenCalledWith("/login"))
    })

    it("volta para o login mesmo se a chamada de logout falhar", async () => {
        const assign = stubLocation()
        mocks.post.mockRejectedValue(new Error("offline"))
        render(<LogoutButton collapsed />)

        fireEvent.click(screen.getByRole("button", { name: "Sair" }))

        await waitFor(() => expect(assign).toHaveBeenCalledWith("/login"))
    })
})
