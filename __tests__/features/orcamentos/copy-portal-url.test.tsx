/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { CopyPortalUrlButton, portalUrlFrom } from "@/features/orcamentos/components/clients/CopyPortalUrlButton"

describe("copiar a URL do portal", () => {
    it("monta a URL absoluta a partir da origem da página", () => {
        expect(portalUrlFrom("/cliente?t=cli_x")).toBe(`${window.location.origin}/cliente?t=cli_x`)
    })

    it("copia a URL do portal sem trocar o token e mostra o feedback", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.assign(navigator, { clipboard: { writeText } })
        render(<CopyPortalUrlButton portalPath="/cliente?t=cli_x" portalName="Acme" />)
        fireEvent.click(screen.getByRole("button", { name: /Copiar URL/ }))
        await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/cliente?t=cli_x`))
        expect(screen.getByRole("button", { name: /Copiado/ })).toBeTruthy()
    })
})
