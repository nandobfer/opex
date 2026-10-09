/** @vitest-environment jsdom */

import React, { useRef } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const motion = vi.hoisted(() => ({
    animate: vi.fn(() => {
        const controls = Promise.resolve() as Promise<void> & { stop: () => void }
        controls.stop = vi.fn()
        return controls
    }),
}))

vi.mock("framer-motion", async () => {
    const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion")
    return { ...actual, animate: motion.animate }
})

import {
    DASHBOARD_CONTENT_SELECTOR,
    MAXIMIZED_ATTR,
    applyFrame,
    dashboardContentRect,
    useMaximizedFrame,
} from "@/features/integrations/hooks/useMaximizedFrame"
import { isSearchEscape } from "@/features/integrations/components/DebugSearchBar"

type RectLike = { top: number; left: number; width: number; height: number }
const rectOf = (r: RectLike) => ({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON: () => r }) as DOMRect

let main: HTMLElement
let observers: Array<() => void> = []

beforeEach(() => {
    vi.clearAllMocks()
    observers = []
    main = document.createElement("main")
    main.setAttribute("data-dashboard-content", "")
    main.getBoundingClientRect = () => rectOf({ top: 120, left: 240, width: 1000, height: 700 })
    document.body.appendChild(main)
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
})

afterEach(() => {
    main.remove()
    vi.unstubAllGlobals()
})

function Frame({ maximized }: { maximized: boolean }) {
    const ref = useRef<HTMLDivElement>(null)
    useMaximizedFrame(ref, maximized)
    return <div ref={ref} data-testid="frame" />
}

describe("dashboardContentRect / applyFrame", () => {
    it("usa o retângulo da área de conteúdo do dashboard", () => {
        expect(document.querySelector(DASHBOARD_CONTENT_SELECTOR)).toBe(main)
        expect(dashboardContentRect()).toEqual({ top: 120, left: 240, width: 1000, height: 700 })
    })

    it("compensa o containing block de um ancestral com transform", () => {
        const el = document.createElement("div")
        // Posicionado em 0,0, o elemento aparece em (50, 30): ancestral transformado.
        el.getBoundingClientRect = () => rectOf({ top: 30, left: 50, width: 0, height: 0 })
        applyFrame(el, { top: 120, left: 240, width: 1000, height: 700 })
        expect(el.style.position).toBe("fixed")
        expect(el.style.top).toBe("90px")
        expect(el.style.left).toBe("190px")
        expect(el.style.width).toBe("1000px")
        expect(el.style.height).toBe("700px")
        expect(el.hasAttribute(MAXIMIZED_ATTR)).toBe(true)
    })
})

describe("regressão: transição CSS não desloca o elemento maximizado", () => {
    /** Simula um elemento com transição CSS: enquanto ela vale, a medição devolve a posição antiga. */
    function transitioningElement() {
        const el = document.createElement("div")
        el.getBoundingClientRect = () =>
            el.style.transition === "none"
                ? rectOf({ top: 0, left: 0, width: 0, height: 0 }) // posição real após ir a 0,0
                : rectOf({ top: 400, left: 700, width: 0, height: 0 }) // ainda no centro (transição)
        return el
    }

    it("desliga a transição antes de medir: posição final é a da área de conteúdo", () => {
        const el = transitioningElement()
        applyFrame(el, { top: 120, left: 240, width: 1000, height: 700 })
        expect(el.style.transition).toBe("none")
        expect(el.style.top).toBe("120px")
        expect(el.style.left).toBe("240px")
    })

    it("aplica z-index 10 ao maximizar e restaurar remove transition e z-index", async () => {
        const view = render(<Frame maximized />)
        const el = screen.getByTestId("frame")
        expect(el.style.transition).toBe("none")
        expect(el.style.zIndex).toBe("10")
        view.rerender(<Frame maximized={false} />)
        await act(async () => {
            await Promise.resolve()
        })
        expect(el.style.transition).toBe("")
        expect(el.style.zIndex).toBe("")
        expect(el.style.position).toBe("")
    })
})

describe("useMaximizedFrame (issue #604)", () => {
    it("não mexe no elemento enquanto não é maximizado", () => {
        render(<Frame maximized={false} />)
        expect(screen.getByTestId("frame").getAttribute("style")).toBeNull()
        expect(motion.animate).not.toHaveBeenCalled()
    })

    it("maximiza sobre a área de conteúdo com animação de entrada", () => {
        render(<Frame maximized />)
        const frame = screen.getByTestId("frame")
        expect(frame.style.position).toBe("fixed")
        expect(frame.style.width).toBe("1000px")
        expect(frame.style.height).toBe("700px")
        expect(motion.animate).toHaveBeenCalledWith(frame, { opacity: [0, 1], scale: [0.97, 1] }, expect.anything())
    })

    it("acompanha o redimensionamento da área de conteúdo", () => {
        render(<Frame maximized />)
        main.getBoundingClientRect = () => rectOf({ top: 120, left: 0, width: 1240, height: 700 })
        act(() => observers.forEach((cb) => cb()))
        expect(screen.getByTestId("frame").style.width).toBe("1240px")
    })

    it("restaurar anima a saída e remove só os estilos aplicados", async () => {
        const view = render(<Frame maximized />)
        const frame = screen.getByTestId("frame")
        motion.animate.mockClear()
        view.rerender(<Frame maximized={false} />)
        expect(motion.animate).toHaveBeenCalledWith(frame, { opacity: [1, 0], scale: [1, 0.97] }, expect.anything())
        await act(async () => {
            await Promise.resolve()
        })
        expect(frame.style.position).toBe("")
        expect(frame.style.width).toBe("")
        expect(frame.hasAttribute(MAXIMIZED_ATTR)).toBe(false)
    })
})

describe("isSearchEscape", () => {
    it("só considera o Esc do campo de busca com texto", () => {
        const input = document.createElement("input")
        input.setAttribute("data-debug-search", "")
        expect(isSearchEscape({ target: input })).toBe(false)
        input.value = "erro"
        expect(isSearchEscape({ target: input })).toBe(true)
        expect(isSearchEscape({ target: document.createElement("input") })).toBe(false)
    })
})

describe("DebugSearchBar — Esc com texto não propaga", () => {
    it("limpa a busca sem deixar o Esc chegar a quem está acima", async () => {
        const { DebugSearchBar } = await import("@/features/integrations/components/DebugSearchBar")
        const parentEsc = vi.fn()
        const onClear = vi.fn()
        render(
            <div onKeyDown={parentEsc}>
                <DebugSearchBar onSearch={vi.fn()} onClear={onClear} results={null} highlightLimit={1000} />
            </div>,
        )
        const input = screen.getByLabelText("Buscar nos logs")
        fireEvent.change(input, { target: { value: "erro" } })
        fireEvent.keyDown(input, { key: "Escape" })
        expect(onClear).toHaveBeenCalled()
        expect(parentEsc).not.toHaveBeenCalled()
        // Vazio, o Esc segue adiante (restaurar/fechar).
        fireEvent.keyDown(input, { key: "Escape" })
        expect(parentEsc).toHaveBeenCalledTimes(1)
    })
})
