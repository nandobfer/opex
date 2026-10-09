/** @vitest-environment jsdom */

import React, { createRef } from "react"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const xterm = vi.hoisted(() => {
    const state = {
        findNext: vi.fn(),
        findPrevious: vi.fn(),
        clearDecorations: vi.fn(),
        resultsListener: null as ((e: { resultIndex: number; resultCount: number }) => void) | null,
        terminalOptions: null as Record<string, unknown> | null,
        writeln: vi.fn((_line: string, callback?: () => void) => callback?.()),
    }
    return state
})

vi.mock("@xterm/xterm/css/xterm.css", () => ({}))
vi.mock("@xterm/xterm", () => ({
    Terminal: class {
        constructor(options: Record<string, unknown>) {
            xterm.terminalOptions = options
        }
        loadAddon() {}
        open() {}
        write() {}
        writeln(line: string, callback?: () => void) {
            xterm.writeln(line, callback)
        }
        clear() {}
        clearSelection() {}
        dispose() {}
    },
}))
vi.mock("@xterm/addon-fit", () => ({ FitAddon: class { fit() {} } }))
vi.mock("@xterm/addon-search", () => ({
    SearchAddon: class {
        findNext = xterm.findNext
        findPrevious = xterm.findPrevious
        clearDecorations = xterm.clearDecorations
        onDidChangeResults(listener: (e: { resultIndex: number; resultCount: number }) => void) {
            xterm.resultsListener = listener
        }
    },
}))

import { DebugSearchBar, formatSearchCounter } from "@/features/integrations/components/DebugSearchBar"
import {
    IntegrationConsole,
    SEARCH_OPTIONS,
    type IntegrationConsoleHandle,
} from "@/features/integrations/components/IntegrationConsole"

beforeEach(() => {
    vi.clearAllMocks()
    xterm.resultsListener = null
})

class ResizeObserverStub {
    observe() {}
    disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub)

describe("formatSearchCounter", () => {
    it("mostra posição/total, 0/0 e o limite de destaques", () => {
        expect(formatSearchCounter({ index: 4, count: 11 }, 1000)).toBe("5/11")
        expect(formatSearchCounter({ index: -1, count: 0 }, 1000)).toBe("0/0")
        expect(formatSearchCounter({ index: -1, count: 1500 }, 1000)).toBe("1000+")
        expect(formatSearchCounter(null, 1000)).toBe("")
    })
})

describe("DebugSearchBar (issue #604)", () => {
    function setup(results: { index: number; count: number } | null = null) {
        const onSearch = vi.fn()
        const onClear = vi.fn()
        const view = render(<DebugSearchBar onSearch={onSearch} onClear={onClear} results={results} highlightLimit={1000} />)
        const input = screen.getByLabelText("Buscar nos logs")
        return { onSearch, onClear, input, view }
    }

    it("Enter busca a próxima e Shift+Enter a anterior; não filtra nada sozinho ao digitar", () => {
        const { onSearch, input } = setup()
        fireEvent.change(input, { target: { value: " erro " } })
        expect(onSearch).not.toHaveBeenCalled()
        fireEvent.keyDown(input, { key: "Enter" })
        expect(onSearch).toHaveBeenLastCalledWith("erro", "next")
        fireEvent.keyDown(input, { key: "Enter", shiftKey: true })
        expect(onSearch).toHaveBeenLastCalledWith("erro", "previous")
    })

    it("mostra 5/11 e as setas navegam entre as ocorrências", () => {
        const { onSearch, input, view } = setup()
        fireEvent.change(input, { target: { value: "erro" } })
        fireEvent.keyDown(input, { key: "Enter" })
        view.rerender(<DebugSearchBar onSearch={onSearch} onClear={vi.fn()} results={{ index: 4, count: 11 }} highlightLimit={1000} />)

        expect(screen.getByTestId("search-counter").textContent).toBe("5/11")
        fireEvent.click(screen.getByRole("button", { name: "Próxima ocorrência (Enter)" }))
        expect(onSearch).toHaveBeenLastCalledWith("erro", "next")
        fireEvent.click(screen.getByRole("button", { name: "Ocorrência anterior (Shift+Enter)" }))
        expect(onSearch).toHaveBeenLastCalledWith("erro", "previous")
    })

    it("sem ocorrências: 0/0 e setas desabilitadas", () => {
        const { input, view, onSearch } = setup()
        fireEvent.change(input, { target: { value: "inexistente" } })
        fireEvent.keyDown(input, { key: "Enter" })
        view.rerender(<DebugSearchBar onSearch={onSearch} onClear={vi.fn()} results={{ index: -1, count: 0 }} highlightLimit={1000} />)
        expect(screen.getByTestId("search-counter").textContent).toContain("0/0")
        expect(screen.getByRole("button", { name: "Próxima ocorrência (Enter)" }).hasAttribute("disabled")).toBe(true)
    })

    it("Esc limpa a busca", () => {
        const { input, onClear } = setup()
        fireEvent.change(input, { target: { value: "erro" } })
        fireEvent.keyDown(input, { key: "Escape" })
        expect(onClear).toHaveBeenCalled()
        expect((input as HTMLInputElement).value).toBe("")
    })
})

describe("IntegrationConsole — busca no buffer", () => {
    async function mountConsole() {
        const ref = createRef<IntegrationConsoleHandle>()
        const onSearchResults = vi.fn()
        render(<IntegrationConsole ref={ref} onSearchResults={onSearchResults} />)
        await waitFor(() => expect(xterm.resultsListener).not.toBeNull())
        return { ref, onSearchResults }
    }

    it("habilita decorações e busca sem diferenciar maiúsculas, com destaques", async () => {
        const { ref } = await mountConsole()
        expect(xterm.terminalOptions?.allowProposedApi).toBe(true)
        expect(SEARCH_OPTIONS.caseSensitive).toBe(false)
        expect(SEARCH_OPTIONS.decorations?.matchBackground).toMatch(/^#[0-9a-f]{6}$/i)

        ref.current!.search("Erro", "next")
        expect(xterm.findNext).toHaveBeenCalledWith("Erro", SEARCH_OPTIONS)
        ref.current!.search("Erro", "previous")
        expect(xterm.findPrevious).toHaveBeenCalledWith("Erro", SEARCH_OPTIONS)
    })

    it("repassa a contagem do addon e limpa os destaques", async () => {
        const { ref, onSearchResults } = await mountConsole()
        act(() => xterm.resultsListener!({ resultIndex: 4, resultCount: 11 }))
        expect(onSearchResults).toHaveBeenLastCalledWith({ index: 4, count: 11 })

        ref.current!.clearSearch()
        expect(xterm.clearDecorations).toHaveBeenCalled()
        expect(onSearchResults).toHaveBeenLastCalledWith({ index: -1, count: 0 })
    })

    it("linhas novas com busca ativa recalculam sem avançar (incremental)", async () => {
        const { ref } = await mountConsole()
        ref.current!.search("erro", "next")
        xterm.findNext.mockClear()
        ref.current!.writeLines(["linha 1", "erro novo"])
        expect(xterm.findNext).toHaveBeenCalledTimes(1)
        expect(xterm.findNext).toHaveBeenCalledWith("erro", { ...SEARCH_OPTIONS, incremental: true })
    })

    it("sem busca ativa, escrever linhas não busca", async () => {
        const { ref } = await mountConsole()
        ref.current!.writeLines(["linha"])
        expect(xterm.findNext).not.toHaveBeenCalled()
    })
})
