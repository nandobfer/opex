/** @vitest-environment happy-dom */

import React from "react"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { framerMotionMock } from "../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())

import { HOVER_POPOVER_CLOSE_DELAY } from "@/hooks/useHoverPopover"
import { MemoryDetailPopover } from "@/features/ai/components/memories/MemoryDetailPopover"

/** OPE-139: painel do aviso de memória — hover abre, clique fixa (`pinOnClick`), Esc/clique fora/fechar soltam. */

const content = vi.fn(() => <p>Conteúdo da memória</p>)
const renderPopover = () =>
    render(
        <div data-testid="saida" style={{ overflow: "auto", maxHeight: 80 }}>
            <MemoryDetailPopover label="Memória do aviso" content={content}>
                Memória gravada pelo agente: X
            </MemoryDetailPopover>
            <button type="button">fora</button>
        </div>,
    )
const trigger = () => screen.getByRole("button", { name: "Memória do aviso: ver detalhes" })
const panel = () => screen.queryByTestId("memory-detail-panel")
const mouse = { pointerType: "mouse" }
const wait = (ms: number) =>
    act(() => {
        vi.advanceTimersByTime(ms)
    })

beforeEach(() => {
    content.mockClear()
    vi.useFakeTimers()
})
afterEach(() => {
    cleanup()
    vi.useRealTimers()
})

describe("MemoryDetailPopover (useHoverPopover com pinOnClick)", () => {
    it("o conteúdo só monta com o painel aberto; o painel fica fora da rolagem da saída (portal)", () => {
        renderPopover()
        expect(content).not.toHaveBeenCalled()
        fireEvent.pointerEnter(trigger(), mouse)
        expect(panel()).toBeTruthy()
        expect(content).toHaveBeenCalled()
        expect(screen.getByTestId("saida").contains(panel())).toBe(false)
        expect(panel()!.getAttribute("data-pinned")).toBe("false")
    })

    it("ordem real: entra no painel antes de sair do texto e espera mais que o atraso — continua aberto; sair fecha", () => {
        renderPopover()
        fireEvent.pointerEnter(trigger(), mouse)
        fireEvent.pointerEnter(panel()!, mouse)
        fireEvent.pointerLeave(trigger(), mouse)
        wait(HOVER_POPOVER_CLOSE_DELAY * 3)
        expect(panel()).toBeTruthy()
        fireEvent.pointerLeave(panel()!, mouse)
        wait(HOVER_POPOVER_CLOSE_DELAY + 10)
        expect(panel()).toBeNull()
    })

    it("clique fixa: sair do texto e do painel não fecha; o botão de fechar fecha", () => {
        renderPopover()
        fireEvent.pointerEnter(trigger(), mouse)
        fireEvent.click(trigger())
        expect(panel()!.getAttribute("data-pinned")).toBe("true")
        fireEvent.pointerLeave(trigger(), mouse)
        wait(HOVER_POPOVER_CLOSE_DELAY * 4)
        expect(panel()).toBeTruthy()
        fireEvent.click(screen.getByRole("button", { name: "Fechar detalhes da memória" }))
        expect(panel()).toBeNull()
    })

    it("fixado: Esc fecha; outro clique no texto solta e fecha", () => {
        renderPopover()
        fireEvent.click(trigger())
        expect(panel()!.getAttribute("data-pinned")).toBe("true")
        fireEvent.keyDown(panel()!, { key: "Escape" })
        expect(panel()).toBeNull()
        fireEvent.click(trigger())
        expect(panel()).toBeTruthy()
        fireEvent.click(trigger())
        expect(panel()).toBeNull()
    })

    it("dentro de um formulário: o gatilho é type=button e não envia o formulário", () => {
        const submit = vi.fn((event: React.FormEvent) => event.preventDefault())
        render(
            <form onSubmit={submit}>
                <MemoryDetailPopover label="Memória do aviso" content={content}>
                    texto
                </MemoryDetailPopover>
            </form>,
        )
        fireEvent.click(trigger())
        expect(trigger().getAttribute("type")).toBe("button")
        expect(submit).not.toHaveBeenCalled()
    })
})
