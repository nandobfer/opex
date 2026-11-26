// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { framerMotionMock } from "../helpers/framer-motion"

const loaded = vi.hoisted(() => ({ library: false, data: false }))
vi.mock("framer-motion", () => framerMotionMock())
vi.mock("emoji-picker-react", () => {
    loaded.library = true
    return { default: () => null, Theme: { DARK: "dark" }, EmojiStyle: { NATIVE: "native" } }
})
vi.mock("emoji-picker-react/dist/data/emojis-pt.js", () => {
    loaded.data = true
    return { default: {} }
})

import { EmojiPickerPopover } from "@/features/secretary-agent/components/conversations/EmojiPickerPopover"

afterEach(() => cleanup())

it("OPE-197: o seletor de emojis e o dicionário pt só carregam quando o seletor abre", () => {
    render(<EmojiPickerPopover trigger={<button type="button">Emojis</button>} onSelect={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Emojis" })).toBeTruthy()
    expect(loaded).toEqual({ library: false, data: false })
})
