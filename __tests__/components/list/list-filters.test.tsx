/** @vitest-environment happy-dom */

import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ListFilters, SEARCH_DEBOUNCE_MS } from "@/components/list/ListFilters"
import { FilterGroup } from "@/components/list/FilterGroup"

afterEach(() => {
    cleanup()
    vi.useRealTimers()
})

function renderFilters(overrides: Partial<React.ComponentProps<typeof ListFilters>> = {}) {
    const onSearch = vi.fn()
    const onClear = vi.fn()
    render(
        <ListFilters total={7} onClear={onClear} search={{ value: "", onChange: onSearch, placeholder: "Nome..." }} {...overrides}>
            <FilterGroup label="Status" className="flex-1 min-w-[150px]">
                <span>filtro da página</span>
            </FilterGroup>
        </ListFilters>,
    )
    return { onSearch, onClear }
}

describe("ListFilters (wrapper genérico de filtros)", () => {
    it("busca ocupa o espaço disponível e os filtros da página ficam na mesma linha", () => {
        renderFilters()
        const searchGroup = screen.getByLabelText("Busca").closest("div.flex-col")
        expect(searchGroup?.className).toContain("flex-[2]")
        expect(screen.getByText("filtro da página")).toBeTruthy()
        expect(screen.getByText("7 REGISTROS")).toBeTruthy()
        expect(screen.getByLabelText("Busca").closest(".lg\\:flex-nowrap")).toBeTruthy()
    })

    it("aplica a busca só depois da espera (debounce)", () => {
        vi.useFakeTimers()
        const { onSearch } = renderFilters()
        fireEvent.change(screen.getByLabelText("Busca"), { target: { value: "ana" } })
        act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 50))
        expect(onSearch).not.toHaveBeenCalled()
        act(() => vi.advanceTimersByTime(60))
        expect(onSearch).toHaveBeenCalledWith("ana")
    })

    it("Limpar zera a busca digitada e chama onClear", () => {
        const { onClear } = renderFilters()
        const input = screen.getByLabelText("Busca") as HTMLInputElement
        fireEvent.change(input, { target: { value: "x" } })
        fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }))
        expect(onClear).toHaveBeenCalled()
        expect(input.value).toBe("")
    })

    it("segunda linha (secondary) fica abaixo, no mesmo card, fora da linha do Limpar", () => {
        renderFilters({ secondary: <FilterGroup label="Ordenar"><span>ordenação</span></FilterGroup> })
        const secondRow = screen.getByText("ordenação").closest(".mt-3")
        expect(secondRow).toBeTruthy()
        expect(secondRow?.contains(screen.getByRole("button", { name: "Limpar filtros" }))).toBe(false)
    })

    it("sem busca: mostra só os filtros da página e o Limpar", () => {
        renderFilters({ search: undefined })
        expect(screen.queryByLabelText("Busca")).toBeNull()
        expect(screen.getByRole("button", { name: "Limpar filtros" })).toBeTruthy()
    })
})
