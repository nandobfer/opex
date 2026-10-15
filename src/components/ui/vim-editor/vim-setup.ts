import { Vim, getCM } from "@replit/codemirror-vim"
import type { EditorView } from "@codemirror/view"
import { runCtrlEnterAction } from "@/components/ctrl-enter-submit"
import { readSystemClipboard, writeSystemClipboard } from "./clipboard"
import { vimHostTextarea } from "./host"
import { readLineNumbers, setLineNumberOption, type LineNumberOption } from "@/features/editor-mode/line-numbers"

type RegisterController = ReturnType<typeof Vim.getRegisterController>
type ExCm = { cm6?: EditorView }

/** Operações que, como no `clipboard=unnamedplus`, também vão para a área de transferência. */
const CLIPBOARD_OPERATORS = new Set(["yank", "delete", "change"])

const patched = new WeakSet<RegisterController>()
let exDefined = false
/** Último texto trocado com o sistema: evita sobrescrever o registrador com o próprio yank. */
let lastClipboardText: string | null = null

function textareaOf(cm: ExCm): HTMLTextAreaElement | null {
    return cm.cm6 ? vimHostTextarea(cm.cm6.dom) : null
}

/** Sai do editor sem enviar (`:q`). */
function leave(cm: ExCm): void {
    cm.cm6?.contentDOM.blur()
}

/**
 * Os comandos de escrita (`:w`, `:wq`, `:x`) só agem em campo editável: num campo desabilitado ou
 * somente leitura eles ficam inertes, sem erro. `:q` continua saindo do editor.
 */
function canWrite(cm: ExCm): boolean {
    const textarea = textareaOf(cm)
    return Boolean(textarea) && !textarea?.disabled && !textarea?.readOnly
}

function defineExCommands(): void {
    if (exDefined) return
    exDefined = true
    Vim.defineEx("write", "w", (cm: ExCm) => {
        const textarea = textareaOf(cm)
        if (textarea && canWrite(cm)) runCtrlEnterAction(textarea)
    })
    Vim.defineEx("quit", "q", (cm: ExCm) => leave(cm))
    Vim.defineEx("wq", "wq", (cm: ExCm) => {
        const textarea = textareaOf(cm)
        if (textarea && canWrite(cm)) runCtrlEnterAction(textarea)
        leave(cm)
    })
    Vim.defineEx("xit", "x", (cm: ExCm) => {
        const textarea = textareaOf(cm)
        if (textarea && canWrite(cm)) runCtrlEnterAction(textarea)
        leave(cm)
    })
}

/** Registrador sem nome ligado à área de transferência do sistema (escrita a cada yank/delete). */
function patchRegisters(): void {
    const controller = Vim.getRegisterController()
    if (patched.has(controller)) return
    patched.add(controller)
    const original = controller.pushText.bind(controller)
    controller.pushText = (registerName, operator, text, linewise, blockwise) => {
        original(registerName, operator, text, linewise, blockwise)
        const unnamed = !registerName || registerName === '"'
        if (!unnamed || !CLIPBOARD_OPERATORS.has(operator)) return
        const value = controller.unnamedRegister.toString()
        lastClipboardText = value
        writeSystemClipboard(value)
    }
}

let optionsDefined = false

/**
 * `:set number`/`nu`, `relativenumber`/`rnu` (e `no…`, `…!`, `…?`): opções globais salvas no
 * navegador, aplicadas a todos os editores abertos pela preferência `useLineNumbers`.
 */
function defineLineNumberOptions(): void {
    if (optionsDefined) return
    optionsDefined = true
    const define = (option: LineNumberOption, alias: string) =>
        Vim.defineOption(option, undefined, "boolean", [alias], (value?: boolean, cm?: unknown) => {
            if (value === undefined) return readLineNumbers()[option]
            if (cm === undefined) setLineNumberOption(option, value)
            return undefined
        })
    define("number", "nu")
    define("relativenumber", "rnu")
}

let copyListening = false

/** Texto selecionado no momento de um copiar/recortar fora do editor. */
function copiedSelection(): string {
    const active = document.activeElement
    if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) {
        const { selectionStart, selectionEnd, value } = active
        return selectionStart !== null && selectionEnd !== null ? value.slice(selectionStart, selectionEnd) : ""
    }
    return window.getSelection()?.toString() ?? ""
}

function listenCopies(): void {
    if (copyListening) return
    copyListening = true
    const onCopy = (event: Event) => {
        if (event.target instanceof Element && vimHostTextarea(event.target)) return
        pushCopiedText(copiedSelection())
    }
    document.addEventListener("copy", onCopy, true)
    document.addEventListener("cut", onCopy, true)
}

/** Configuração global do Vim (comandos `:w`/`:q` e área de transferência); idempotente. */
export function configureVim(): void {
    defineExCommands()
    defineLineNumberOptions()
    patchRegisters()
    listenCopies()
}

/**
 * Traz o texto copiado fora do editor para o registrador sem nome, para o `p` colar o que está na
 * área de transferência do sistema. Sem permissão de leitura, nada muda.
 */
export async function pullSystemClipboard(): Promise<void> {
    const text = await readSystemClipboard()
    if (text === null || text === "" || text === lastClipboardText) return
    lastClipboardText = text
    Vim.getRegisterController().unnamedRegister.setText(text, text.endsWith("\n"))
}

/** Texto copiado dentro do app (Ctrl+C fora do editor) também alimenta o `p`. */
export function pushCopiedText(text: string): void {
    if (!text || text === lastClipboardText) return
    lastClipboardText = text
    Vim.getRegisterController().unnamedRegister.setText(text, false)
}

export type VimMode = "normal" | "insert" | "visual" | "visual-line" | "visual-block" | "replace"

/** Modo atual do Vim no editor. */
export function currentVimMode(view: EditorView): VimMode {
    const vim = getCM(view)?.state.vim
    if (!vim) return "normal"
    if (vim.insertMode) return getCM(view)?.state.overwrite ? "replace" : "insert"
    if (vim.visualMode) return vim.visualBlock ? "visual-block" : vim.visualLine ? "visual-line" : "visual"
    return "normal"
}

/** Converte o evento `vim-mode-change` no modo exibido. */
export function modeFromChange(event: { mode?: string; subMode?: string }): VimMode {
    if (event.mode === "insert") return "insert"
    if (event.mode === "replace") return "replace"
    if (event.mode === "visual") return event.subMode === "linewise" ? "visual-line" : event.subMode === "blockwise" ? "visual-block" : "visual"
    return "normal"
}

/**
 * O Esc deve ficar no editor (voltar ao modo normal, cancelar comando pendente ou o prompt `:`)
 * em vez de fechar o diálogo em volta?
 */
export function escapeBelongsToVim(view: EditorView): boolean {
    const cm = getCM(view)
    const vim = cm?.state.vim
    if (!cm || !vim) return false
    return vim.insertMode || vim.visualMode || Boolean(cm.state.dialog) || vim.inputState.keyBuffer.length > 0 || Boolean(vim.inputState.operator) || Boolean(vim.status)
}

/** Envia um Esc ao Vim (mesmo caminho que o plugin usa internamente). */
export function sendVimEscape(view: EditorView): void {
    const cm = getCM(view)
    if (!cm) return
    cm.operation(() => {
        Vim.handleKey(cm, "<Esc>", "user")
    })
}

/** Entra no modo de inserção (ao ligar o Vim com o campo já em edição). */
export function enterInsertMode(view: EditorView): void {
    const cm = getCM(view)
    if (!cm) return
    Vim.handleKey(cm, "i", "user")
}

/**
 * Ctrl+J no modo INSERT: quebra a linha no cursor, substituindo a seleção, como o Enter do
 * `<textarea>`. Respeita `maxLength` do campo e não age em campo somente leitura.
 */
export function vimInsertLineBreak(view: EditorView): boolean {
    if (view.state.readOnly) return true
    const max = vimHostTextarea(view.dom)?.maxLength ?? -1
    const { from, to } = view.state.selection.main
    if (max >= 0 && view.state.doc.length - (to - from) + 1 > max) return true
    view.dispatch({ changes: { from, to, insert: "\n" }, scrollIntoView: true, userEvent: "input" })
    return true
}

/** Ctrl+E no modo INSERT: leva o cursor ao fim da linha lógica atual (até o próximo `\n`). */
export function vimLineEnd(view: EditorView): boolean {
    const end = view.state.doc.lineAt(view.state.selection.main.to).to
    view.dispatch({ selection: { anchor: end }, scrollIntoView: true })
    return true
}
