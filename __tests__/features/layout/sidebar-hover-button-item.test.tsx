/** @vitest-environment happy-dom */

import React from "react"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Gauge } from "lucide-react"
import { framerMotionMock } from "../../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())
vi.mock("next/navigation", () => ({ usePathname: () => "/tarefas" }))

import { SidebarHoverButtonItem } from "@/features/layout/components/sidebar/SidebarHoverButtonItem"
import { HOVER_POPOVER_CLOSE_DELAY } from "@/hooks/useHoverPopover"

const mouse = { pointerType: "mouse" }

function renderItem(collapsed = true) {
    return render(
        <ul>
            <SidebarHoverButtonItem
                label="Servidor e quota"
                drawerLabel="Servidor"
                icon={Gauge}
                collapsed={collapsed}
                reduceMotion
                testId="item"
                panel={
                    <div>
                        <button type="button">Primeiro</button>
                        <button type="button">Segundo</button>
                    </div>
                }
            />
        </ul>,
    )
}

const trigger = () => screen.getByTestId("item-trigger")
const panel = () => screen.queryByTestId("item-panel")
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

/** Enter/Espaço num `<button>` focado ativam o clique nativo (o happy-dom não sintetiza a ativação). */
function pressKey(key: "Enter" | " ") {
    const target = trigger()
    target.focus()
    const allowed = fireEvent.keyDown(target, { key })
    if (allowed) fireEvent.click(target)
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
    vi.useRealTimers()
    cleanup()
})

describe("SidebarHoverButtonItem (OPE-145)", () => {
    it("hover abre o painel; sair do gatilho fecha depois do atraso; entrar no painel mantém aberto", () => {
        renderItem()
        expect(panel()).toBeNull()
        fireEvent.pointerEnter(trigger(), mouse)
        expect(panel()).toBeTruthy()

        fireEvent.pointerLeave(trigger(), mouse)
        fireEvent.pointerEnter(panel()!, mouse)
        advance(HOVER_POPOVER_CLOSE_DELAY + 10)
        expect(panel()).toBeTruthy()

        fireEvent.pointerLeave(panel()!, mouse)
        advance(HOVER_POPOVER_CLOSE_DELAY - 10)
        expect(panel()).toBeTruthy()
        advance(20)
        expect(panel()).toBeNull()
    })

    it("clique com o cursor em cima mantém aberto (sem o toggle duplo do Radix)", () => {
        renderItem()
        fireEvent.pointerEnter(trigger(), mouse)
        fireEvent.click(trigger())
        expect(panel()).toBeTruthy()
        expect(trigger().getAttribute("aria-expanded")).toBe("true")
    })

    it("Enter abre com o foco no primeiro botão do painel; Esc fecha e devolve o foco", () => {
        renderItem()
        pressKey("Enter")
        expect(panel()).toBeTruthy()
        expect((document.activeElement as HTMLElement | null)?.textContent).toBe("Primeiro")

        fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" })
        expect((document.activeElement as HTMLElement | null)?.textContent).toBe("Segundo")

        fireEvent.keyDown(document.activeElement!, { key: "Escape" })
        advance(0)
        expect(panel()).toBeNull()
        expect(document.activeElement).toBe(trigger())
    })

    it("Espaço também abre; outro Espaço fecha", () => {
        renderItem()
        pressKey(" ")
        expect(panel()).toBeTruthy()
        pressKey(" ")
        expect(panel()).toBeNull()
    })

    it("não navega: é um botão com aria-label e, na gaveta, mostra o rótulo da linha", () => {
        const view = renderItem()
        expect(trigger().tagName).toBe("BUTTON")
        expect(trigger().getAttribute("aria-label")).toBe("Servidor e quota")
        expect(screen.queryByText("Servidor")).toBeNull()
        view.unmount()
        renderItem(false)
        expect(screen.getByText("Servidor")).toBeTruthy()
    })
})
