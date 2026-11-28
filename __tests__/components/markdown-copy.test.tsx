/** @vitest-environment happy-dom */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { MessageSquare } from "lucide-react"
import { framerMotionMock } from "../helpers/framer-motion"

vi.mock("framer-motion", () => framerMotionMock())

import { Markdown } from "@/components/ui/markdown"
import type { MarkdownLineAction } from "@/components/ui/markdown-line-action"
import { selectionClipboard } from "@/lib/markdown/copy"
import { configureVim } from "@/components/ui/vim-editor/vim-setup"
import { Vim } from "@replit/codemirror-vim"

afterEach(() => {
    window.getSelection()?.removeAllRanges()
    cleanup()
})

interface Point {
    node: Node
    offset: number
}

/** Ponto no texto renderizado: `at` caracteres depois do começo de `needle` (`occurrence`-ésima). */
function at(root: HTMLElement, needle: string, delta = 0, occurrence = 0): Point {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let seen = 0
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node as Text
        let index = text.data.indexOf(needle)
        while (index !== -1) {
            if (seen++ === occurrence) return { node: text, offset: index + delta }
            index = text.data.indexOf(needle, index + 1)
        }
    }
    throw new Error(`texto não encontrado: ${needle}`)
}

const end = (root: HTMLElement, needle: string, occurrence = 0) => at(root, needle, needle.length, occurrence)

function select(start: Point, finish: Point) {
    const range = document.createRange()
    range.setStart(start.node, start.offset)
    range.setEnd(finish.node, finish.offset)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
}

function selectAll(root: HTMLElement) {
    const range = document.createRange()
    range.selectNodeContents(root)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
}

function copy(target: EventTarget = document) {
    const data = new Map<string, string>()
    const event = new Event("copy", { bubbles: true, cancelable: true })
    const setData = vi.fn((type: string, value: string) => void data.set(type, value))
    Object.defineProperty(event, "clipboardData", { value: { setData } })
    target.dispatchEvent(event)
    return { data, setData, prevented: event.defaultPrevented }
}

const copied = () => selectionClipboard(window.getSelection())?.text ?? null

function mount(markdown: string, lineAction?: MarkdownLineAction | null) {
    const { container } = render(<Markdown lineAction={lineAction}>{markdown}</Markdown>)
    return container.firstElementChild as HTMLElement
}

const RESPONSE = [
    "## Resumo",
    "",
    "Texto com **negrito**, `código` e [link](https://exemplo.com).",
    "",
    "- item um",
    "- item dois",
    "  - aninhado",
    "",
    "```ts",
    "const a = 1",
    "const b = 2",
    "```",
    "",
    "Fim.",
].join("\n")

describe("copiar o Markdown renderizado", () => {
    it("resposta inteira: o Markdown-fonte idêntico em text/plain e o HTML em text/html", () => {
        const root = mount(RESPONSE)
        selectAll(root)
        const { data, prevented } = copy()
        expect(prevented).toBe(true)
        expect(data.get("text/plain")).toBe(RESPONSE)
        expect(data.get("text/html")).toContain("<strong")
    })

    it("seleção parcial entre parágrafos copia só o trecho", () => {
        const root = mount("Primeiro parágrafo com **forte** aqui.\n\nSegundo parágrafo final.")
        select(at(root, "parágrafo com"), end(root, "Segundo"))
        expect(copied()).toBe("parágrafo com **forte** aqui.\n\nSegundo")
    })

    it("título inteiro e parte do parágrafo seguinte levam o `## `", () => {
        const root = mount("## Título\n\nCorpo do texto.")
        select(at(root, "Título"), end(root, "Corpo"))
        expect(copied()).toBe("## Título\n\nCorpo")
    })

    it("só o começo do título: sem o marcador", () => {
        const root = mount("## Título\n\nCorpo.")
        select(at(root, "Título"), at(root, "Título", 3))
        expect(copied()).toBe("Tít")
    })

    it("metade do negrito e metade do link saem como texto puro (D3)", () => {
        const root = mount("Um **negrito** e [um link](https://x.dev) fim.")
        select(at(root, "negrito", 3), at(root, "negrito", 6))
        expect(copied()).toBe("rit")
        select(at(root, "negrito", 3), at(root, "um link", 2))
        expect(copied()).toBe("rito e um")
    })

    it("negrito e link inteiros no meio da seleção vão com a marcação", () => {
        const root = mount("Um **negrito** e [um link](https://x.dev) fim.")
        select(at(root, "Um"), end(root, " fim"))
        expect(copied()).toBe("Um **negrito** e [um link](https://x.dev) fim")
        select(at(root, "negrito"), end(root, "negrito"))
        expect(copied()).toBe("**negrito**")
    })

    it("linhas dentro do bloco de código: o código puro, sem cercas (D2)", () => {
        const root = mount(RESPONSE)
        select(at(root, "const a"), end(root, "const b"))
        expect(copied()).toBe("const a = 1\nconst b")
    })

    it("seleção que entra no meio do bloco a partir do item anterior ganha só a cerca de fechamento", () => {
        const root = mount("Antes do bloco.\n\n```ts\nconst a = 1\nconst b = 2\n```")
        select(at(root, "bloco"), end(root, "const a = 1"))
        expect(copied()).toBe("bloco.\n\n```ts\nconst a = 1\n```")
    })

    it("seleção que começa no meio do bloco e sai dele ganha a cerca de abertura", () => {
        const root = mount("```ts\nconst a = 1\nconst b = 2\n```\n\nDepois.")
        select(at(root, "const b"), end(root, "Depois"))
        expect(copied()).toBe("```ts\nconst b = 2\n```\n\nDepois")
    })

    it("tabela cortada entre células vira linhas inteiras com cabeçalho e delimitador", () => {
        const root = mount("| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |")
        select(at(root, "2"), at(root, "3", 1))
        expect(copied()).toBe("| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |")
        select(at(root, "1"), end(root, "1"))
        expect(copied()).toBe("1")
    })

    it("lista aninhada e citação não deixam indentação nem `> ` desalinhados", () => {
        const list = mount("- pai\n  - filho um\n  - filho dois")
        select(at(list, "filho um"), end(list, "filho dois"))
        expect(copied()).toBe("- filho um\n- filho dois")
        cleanup()
        const quote = mount("> linha um\n> linha dois")
        select(at(quote, "um"), end(quote, "dois"))
        expect(copied()).toBe("um\nlinha dois")
    })

    it("com ação por linha e badge, o texto copiado é igual ao sem ação e sem rótulos de botão", () => {
        const action: MarkdownLineAction = { icon: MessageSquare, label: "Comentar a linha", count: () => 3, onSelect: vi.fn() }
        const withAction = mount(RESPONSE, action)
        selectAll(withAction)
        const { data } = copy()
        expect(data.get("text/plain")).toBe(RESPONSE)
        expect(data.get("text/plain")).not.toContain("3")
        expect(data.get("text/html")).not.toContain("Comentar a linha")
        expect(data.get("text/html")).not.toContain("Copiar bloco de código")
        expect(data.get("text/html")).not.toContain("data-md")
    })

    it("seleção mista: Markdown das partes renderizadas e o texto da interface entre elas (D4)", () => {
        const { container } = render(
            <div>
                <span>Fernando 12:30</span>
                <Markdown>{"Olá **mundo**"}</Markdown>
                <span>Agente 12:31</span>
                <Markdown>{"- resposta"}</Markdown>
            </div>,
        )
        const box = container.firstElementChild as HTMLElement
        selectAll(box)
        expect(copied()).toBe("Fernando 12:30\n\nOlá **mundo**\n\nAgente 12:31\n\n- resposta")
    })

    it("fora do Markdown, em campos editáveis e com o evento já tratado a cópia segue a nativa", () => {
        const { container } = render(
            <div>
                <p>Texto simples</p>
                <textarea defaultValue="**cru**" />
                <Markdown>{"**md**"}</Markdown>
            </div>,
        )
        const box = container.firstElementChild as HTMLElement
        select(at(box, "Texto"), end(box, "simples"))
        expect(copy().setData).not.toHaveBeenCalled()

        const textarea = box.querySelector("textarea")!
        textarea.focus()
        textarea.setSelectionRange(0, 4)
        select(at(box, "md"), end(box, "md"))
        expect(copy().prevented).toBe(false)
        textarea.blur()

        const handled = new Event("copy", { bubbles: true, cancelable: true })
        const setData = vi.fn()
        Object.defineProperty(handled, "clipboardData", { value: { setData } })
        handled.preventDefault()
        document.dispatchEvent(handled)
        expect(setData).not.toHaveBeenCalled()
    })

    it("seleção pelos limites dos elementos (triplo clique): o bloco inteiro com o marcador", () => {
        const root = mount("Intro.\n\n- item um\n- item dois\n\n> citação")
        const range = document.createRange()
        range.selectNodeContents(root.querySelectorAll("li")[0]!)
        window.getSelection()!.removeAllRanges()
        window.getSelection()!.addRange(range)
        expect(copied()).toBe("- item um")
        range.selectNodeContents(root.querySelector("blockquote")!)
        expect(copied()).toBe("> citação")
    })

    it("começando no fim do bloco anterior, sem linhas em branco na frente", () => {
        const root = mount("Primeiro.\n\n## Segundo")
        select(end(root, "Primeiro."), end(root, "Segundo"))
        expect(copied()).toBe("## Segundo")
    })

    it("escape e entidade no fonte não desalinham; imagem entra inteira", () => {
        const root = mount("Vale 2 \\* 3 &amp; mais ![logo](https://x.dev/l.png) depois")
        select(at(root, "2"), end(root, "depois"))
        expect(copied()).toBe("2 \\* 3 &amp; mais ![logo](https://x.dev/l.png) depois")
    })

    it("o registrador do Vim recebe o mesmo Markdown da área de transferência", () => {
        configureVim()
        const root = mount("Use **isto** agora")
        selectAll(root)
        copy()
        expect(Vim.getRegisterController().unnamedRegister.toString()).toBe("Use **isto** agora")
    })

    it("quando o texto renderizado não casa com o fonte, devolve null (cópia nativa)", () => {
        const root = mount("abc")
        root.querySelector("p")!.appendChild(document.createTextNode(" zzz"))
        select(at(root, "abc"), at(root, "zzz", 2))
        expect(copied()).toBeNull()
        expect(copy().prevented).toBe(false)
    })
})
