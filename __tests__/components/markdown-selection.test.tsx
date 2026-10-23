/** @vitest-environment jsdom */

import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { MessageSquare } from "lucide-react"
import { framerMotionMock } from "../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())

import { Markdown } from "@/components/ui/markdown"
import type { MarkdownLineAction } from "@/components/ui/markdown-line-action"
import { ReplyTargetProvider } from "@/components/agent-reply/ReplyTargetProvider"
import { ReplyTextarea } from "@/components/agent-reply/ReplyTextarea"
import { readSelection, selectionRange } from "@/lib/markdown/selection"

afterEach(() => {
    window.getSelection()?.removeAllRanges()
    cleanup()
})

const action = (overrides: Partial<MarkdownLineAction> = {}): MarkdownLineAction => ({ icon: MessageSquare, label: "Comentar a linha", selectionLabel: "Comentar o trecho", onSelect: vi.fn(), ...overrides })

/** Seleciona de `from` (offset no texto do 1º nó) até `to` (no último). */
function select(startNode: Node, startOffset: number, endNode: Node, endOffset: number) {
    const range = document.createRange()
    range.setStart(startNode, startOffset)
    range.setEnd(endNode, endOffset)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
}

const textIn = (root: HTMLElement, text: string): Text => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if ((node as Text).data.includes(text)) return node as Text
    throw new Error(`texto não encontrado: ${text}`)
}

async function release() {
    fireEvent.pointerUp(document)
    await act(() => new Promise((resolve) => setTimeout(resolve, 150)))
}

describe("seleção no Markdown — leitura", () => {
    it("trecho numa linha: texto da tela, linha âncora e ocorrência repetida", () => {
        const { container } = render(<Markdown lineAction={action()}>{"Use **ab** e ab de novo"}</Markdown>)
        const root = container.firstElementChild as HTMLElement
        const node = textIn(root, " e ab de novo")
        select(node, 3, node, 5)
        const read = readSelection(root, window.getSelection())
        expect(read?.selection).toEqual({ text: "ab", lines: 1, occurrence: 1, startLine: 1 })
        const again = selectionRange(root, read!.anchor, read!.selection)
        expect(again?.startContainer).toBe(node)
        expect(again?.startOffset).toBe(3)
    })

    it("várias linhas: âncora na última, intervalo e corte do que está fora do Markdown", () => {
        const { container } = render(
            <div>
                <p>antes</p>
                <Markdown lineAction={action()}>{"- item um\n- item dois\n- item três"}</Markdown>
            </div>,
        )
        const root = container.querySelector("ul")!.parentElement as HTMLElement
        select(textIn(container, "antes"), 2, textIn(root, "item dois"), 4)
        const read = readSelection(root, window.getSelection())
        expect(read?.selection).toMatchObject({ text: "item um\nitem", lines: 2, startLine: 1 })
        expect(read?.anchor.dataset.mdLine).toBe("2")
        expect(selectionRange(root, read!.anchor, read!.selection)?.toString()).toBe("item um\nitem")
    })

    it("seleção vazia ou fora do Markdown não conta", () => {
        const { container } = render(
            <div>
                <p>fora</p>
                <Markdown lineAction={action()}>{"dentro"}</Markdown>
            </div>,
        )
        const root = container.querySelector("p + div") as HTMLElement
        const outside = textIn(container, "fora")
        select(outside, 0, outside, 2)
        expect(readSelection(root, window.getSelection())).toBeNull()
        select(outside, 1, outside, 1)
        expect(readSelection(root, window.getSelection())).toBeNull()
    })
})

describe("seleção no Markdown — botão flutuante", () => {
    it("aparece ao soltar a seleção e chama a ação com o trecho", async () => {
        const onSelect = vi.fn()
        const { container } = render(<Markdown lineAction={action({ onSelect })}>{"primeira linha\n\nsegunda linha"}</Markdown>)
        const node = textIn(container, "segunda")
        select(node, 0, node, 7)
        await release()
        fireEvent.click(screen.getByRole("button", { name: "Comentar o trecho" }))
        expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ line: 3, text: "segunda linha", selection: { text: "segunda", lines: 1, occurrence: 0, startLine: 3 } }))
        expect(screen.queryByRole("button", { name: "Comentar o trecho" })).toBeNull()
    })

    it("selectionLabel false desliga; seleção desfeita esconde o botão", async () => {
        const { container, rerender } = render(<Markdown lineAction={action({ selectionLabel: false })}>{"texto"}</Markdown>)
        const node = textIn(container, "texto")
        select(node, 0, node, 3)
        await release()
        expect(document.querySelector("[data-md-selection-action]")).toBeNull()
        rerender(<Markdown lineAction={action()}>{"texto"}</Markdown>)
        select(node, 0, node, 3)
        await release()
        expect(screen.getByRole("button", { name: "Comentar o trecho" })).toBeTruthy()
        window.getSelection()?.removeAllRanges()
        await release()
        expect(screen.queryByRole("button", { name: "Comentar o trecho" })).toBeNull()
    })

    it("nas saídas de IA, cita só o trecho no campo de resposta", async () => {
        function Host() {
            const [value, setValue] = useState("")
            return (
                <ReplyTargetProvider>
                    <Markdown>{"O agente sugere usar o componente X agora"}</Markdown>
                    <ReplyTextarea aria-label="Resposta" value={value} onValueChange={setValue} />
                </ReplyTargetProvider>
            )
        }
        const { container } = render(<Host />)
        const node = textIn(container, "componente X")
        const start = node.data.indexOf("componente X")
        select(node, start, node, start + "componente X".length)
        await release()
        fireEvent.click(screen.getByRole("button", { name: "Citar o trecho no campo de resposta" }))
        await act(() => new Promise((resolve) => requestAnimationFrame(resolve)))
        expect((screen.getByLabelText("Resposta") as HTMLTextAreaElement).value).toBe("> componente X\n\n")
    })
})
