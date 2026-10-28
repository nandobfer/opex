/** @vitest-environment happy-dom */

import React from "react"
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

function renderSelect(value: string, onValueChange: (value: string) => void) {
    const select = (current: string) => (
        <form>
            <Select value={current} onValueChange={onValueChange}>
                <SelectTrigger>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="__default__">Padrão</SelectItem>
                    {current !== "__default__" && <SelectItem value={current}>{current}</SelectItem>}
                </SelectContent>
            </Select>
        </form>
    )
    const view = render(select(value))
    return { ...view, rerenderWith: (next: string) => view.rerender(select(next)), native: () => view.container.querySelector("select")! }
}

afterEach(() => cleanup())

describe("Select dentro de <form>", () => {
    it("não chama onValueChange quando o valor controlado muda antes de a opção existir", () => {
        const onValueChange = vi.fn()
        const { rerenderWith } = renderSelect("__default__", onValueChange)
        rerenderWith("build")
        expect(onValueChange).not.toHaveBeenCalled()
    })

    it("ignora a mudança nativa para vazio", () => {
        const onValueChange = vi.fn()
        const { native } = renderSelect("build", onValueChange)
        fireEvent.change(native(), { target: { value: "" } })
        expect(onValueChange).not.toHaveBeenCalled()
    })

    it("repassa a escolha de uma opção válida", () => {
        const onValueChange = vi.fn()
        const { native } = renderSelect("build", onValueChange)
        fireEvent.change(native(), { target: { value: "__default__" } })
        expect(onValueChange).toHaveBeenCalledWith("__default__")
    })
})
