/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { framerMotionMock } from "../../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())

import OfflinePage from "@/app/offline/page"

const reload = vi.fn()
const originalLocation = window.location

describe("página offline do PWA", () => {
    beforeEach(() => {
        reload.mockClear()
        Object.defineProperty(window, "location", { configurable: true, value: { ...originalLocation, reload } })
    })

    afterEach(() => {
        Object.defineProperty(window, "location", { configurable: true, value: originalLocation })
    })

    it("explica em pt-BR que falta conexão", () => {
        render(<OfflinePage />)
        expect(screen.getByRole("heading", { name: "Sem conexão" })).toBeTruthy()
        expect(screen.getByText(/precisa de internet/)).toBeTruthy()
    })

    it("Tentar novamente recarrega a página", () => {
        render(<OfflinePage />)
        fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }))
        expect(reload).toHaveBeenCalledTimes(1)
    })

    it("recarrega sozinha quando a conexão volta", () => {
        render(<OfflinePage />)
        window.dispatchEvent(new Event("online"))
        expect(reload).toHaveBeenCalledTimes(1)
    })
})
