/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { MessageSquare } from "lucide-react"
import { framerMotionMock } from "../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())
const toastError = vi.fn()
vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => toastError(...args), success: vi.fn() } }))

import { Markdown } from "@/components/ui/markdown"
import { CODE_COPIED_MS } from "@/components/ui/markdown-code-block"
import type { MarkdownLineAction } from "@/components/ui/markdown-line-action"

const COPY = "Copiar bloco de código"
const writeText = vi.fn<(text: string) => Promise<void>>()

function setClipboard(value: unknown) {
    Object.defineProperty(navigator, "clipboard", { value, configurable: true })
}

async function click(button: HTMLElement) {
    await act(async () => {
        fireEvent.click(button)
    })
}

const md = ["```ts", "const a = 1", "", "const b = 2", "```"].join("\n")

beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined)
    toastError.mockReset()
    setClipboard({ writeText })
})

afterEach(() => {
    vi.useRealTimers()
})

describe("Markdown — copiar bloco de código", () => {
    it("um botão sempre visível por bloco; copia o texto puro (sem cerca nem linguagem) e mostra o check", async () => {
        const { container } = render(<Markdown>{md}</Markdown>)
        const buttons = screen.getAllByRole("button", { name: COPY })
        expect(buttons).toHaveLength(1)
        const button = buttons[0]!
        expect(button.className).not.toMatch(/\binvisible\b|\bopacity-0\b/)
        expect(container.querySelector("pre")!.contains(button)).toBe(false)
        await click(button)
        expect(writeText).toHaveBeenCalledWith("const a = 1\n\nconst b = 2")
        expect(button.hasAttribute("data-copied")).toBe(true)
        expect(button.textContent).toContain("Copiado")
    })

    it("com ação por linha: um copiar por bloco, fora do pre, mesmo texto e sem disparar a ação da linha", async () => {
        const onSelect = vi.fn()
        const action: MarkdownLineAction = { icon: MessageSquare, label: "Citar", onSelect, count: (line) => (line === 2 ? 3 : 0) }
        const { container } = render(<Markdown lineAction={action}>{md}</Markdown>)
        const copy = screen.getAllByRole("button", { name: COPY })
        expect(copy).toHaveLength(1)
        const quotes = container.querySelectorAll("pre [data-md-line-action] button")
        expect(quotes).toHaveLength(2)
        expect(container.querySelector("pre")!.contains(copy[0]!)).toBe(false)
        await click(copy[0]!)
        expect(writeText).toHaveBeenCalledWith("const a = 1\n\nconst b = 2")
        expect(onSelect).not.toHaveBeenCalled()
    })

    it("dois blocos: cada botão copia o próprio conteúdo", async () => {
        render(<Markdown>{["```", "um", "```", "", "    dois", ""].join("\n")}</Markdown>)
        const buttons = screen.getAllByRole("button", { name: COPY })
        expect(buttons).toHaveLength(2)
        await click(buttons[1]!)
        await click(buttons[0]!)
        expect(writeText.mock.calls.map(([text]) => text)).toEqual(["dois", "um"])
    })

    it("código inline não ganha botão", () => {
        render(<Markdown>{"texto com `inline` no meio"}</Markdown>)
        expect(screen.queryByRole("button", { name: COPY })).toBeNull()
    })

    it("sem área de transferência: o bloco continua renderizado, avisa o erro e não mostra o check", async () => {
        setClipboard(undefined)
        const exec = vi.fn(() => false)
        Object.defineProperty(document, "execCommand", { value: exec, configurable: true })
        const { container } = render(<Markdown>{md}</Markdown>)
        const button = screen.getByRole("button", { name: COPY })
        await click(button)
        expect(toastError).toHaveBeenCalledWith("Não foi possível copiar o bloco de código")
        expect(button.hasAttribute("data-copied")).toBe(false)
        expect(container.querySelector("pre")!.textContent).toContain("const a = 1")
    })

    it("o check volta ao ícone de copiar depois do tempo", async () => {
        vi.useFakeTimers()
        render(<Markdown>{md}</Markdown>)
        const button = screen.getByRole("button", { name: COPY })
        await click(button)
        expect(button.hasAttribute("data-copied")).toBe(true)
        act(() => {
            vi.advanceTimersByTime(CODE_COPIED_MS)
        })
        expect(button.hasAttribute("data-copied")).toBe(false)
    })
})
