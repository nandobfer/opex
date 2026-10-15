"use client"

import { useEffect } from "react"
import { vimHostTextarea } from "@/components/ui/vim-editor/host"

/** Botão a acionar quando o campo multiline não tem `<form>` (ou o `<form>` não é o da feature). */
export const CTRL_ENTER_SUBMIT_ATTR = "data-ctrl-enter-submit"
/** Contêiner que envolve campo + botão: torna a resolução determinística quando o botão não é ancestral direto. */
export const CTRL_ENTER_SCOPE_ATTR = "data-ctrl-enter-scope"
/** Desliga o Ctrl+Enter numa subárvore (reserva; o terminal `.xterm` já é ignorado por padrão). */
export const CTRL_ENTER_IGNORE_ATTR = "data-ctrl-enter-ignore"
/** Desliga todos os atalhos de textarea (Ctrl+Enter, Ctrl+J e Ctrl+E) numa subárvore. */
export const TEXTAREA_SHORTCUTS_IGNORE_ATTR = "data-textarea-shortcuts-ignore"

/** Alvo resolvido para o Ctrl+Enter: um botão marcado ou o `<form>` do campo. */
export type CtrlEnterAction = { kind: "button"; button: HTMLButtonElement } | { kind: "form"; form: HTMLFormElement }

/** O evento é o atalho Ctrl+Enter (⌘+Enter no Mac)? `altKey` desqualifica (AltGr emite ctrl+alt). */
export function isCtrlEnter(event: KeyboardEvent): boolean {
    return event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.altKey
}

/**
 * Resolve a ação principal do campo multiline, do mais específico ao mais genérico:
 * 1. escopo explícito (`data-ctrl-enter-scope`) — primeiro botão marcado dentro dele;
 * 2. botão marcado dentro do `<form>` (necessário quando o `onSubmit` do form não é o da feature);
 * 3. botão marcado em um ancestral (widgets sem `<form>`);
 * 4. o próprio `<form>` (submissão nativa via `requestSubmit`).
 * A caminhada para antes de `document.body`/`documentElement` para nunca casar um botão de outra área.
 */
export function resolveCtrlEnterAction(textarea: HTMLTextAreaElement): CtrlEnterAction | null {
    const scope = textarea.closest<HTMLElement>(`[${CTRL_ENTER_SCOPE_ATTR}]`)
    if (scope) {
        const button = scope.querySelector<HTMLButtonElement>(`[${CTRL_ENTER_SUBMIT_ATTR}]`)
        if (button) return { kind: "button", button }
    }

    const form = textarea.closest<HTMLFormElement>("form")
    if (form) {
        const button = form.querySelector<HTMLButtonElement>(`[${CTRL_ENTER_SUBMIT_ATTR}]`)
        if (button) return { kind: "button", button }
    }

    let node: HTMLElement | null = textarea.parentElement
    while (node && node !== document.body && node !== document.documentElement) {
        const button = node.querySelector<HTMLButtonElement>(`[${CTRL_ENTER_SUBMIT_ATTR}]`)
        if (button) return { kind: "button", button }
        node = node.parentElement
    }

    return form ? { kind: "form", form } : null
}

/** Submete o formulário respeitando a validação; `requestSubmit` com fallback para ambientes sem a API. */
function submitForm(form: HTMLFormElement): void {
    if (typeof form.requestSubmit === "function") {
        form.requestSubmit()
        return
    }
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
}

/** Textarea fora do terminal e das subárvores ignoradas? */
function isEligible(textarea: HTMLTextAreaElement): boolean {
    return !textarea.closest(`[${TEXTAREA_SHORTCUTS_IGNORE_ATTR}]`) && !textarea.closest(".xterm")
}

/**
 * Executa a ação principal (Ctrl+Enter) do campo. Usado também pelo editor Vim (`:w`), cujo valor
 * vive no `<textarea>` escondido. Devolve `false` quando não há ação resolvida.
 */
export function runCtrlEnterAction(textarea: HTMLTextAreaElement): boolean {
    if (!isEligible(textarea) || textarea.closest(`[${CTRL_ENTER_IGNORE_ATTR}]`)) return false
    const action = resolveCtrlEnterAction(textarea)
    if (!action) return false
    if (action.kind === "button") action.button.click()
    else submitForm(action.form)
    return true
}

/**
 * Handler global do Ctrl+Enter: age só em `<textarea>` (nativo ou o escondido do editor Vim) fora do
 * terminal (`.xterm`) e de subárvores ignoradas. Sem alvo resolvido, não previne o padrão (o
 * navegador segue).
 */
export function handleCtrlEnterKey(event: KeyboardEvent): void {
    if (!isCtrlEnter(event) || event.defaultPrevented || event.isComposing) return
    const target = event.target instanceof HTMLTextAreaElement ? event.target : vimHostTextarea(event.target instanceof Element ? event.target : null)
    if (!target || !isEligible(target) || target.closest(`[${CTRL_ENTER_IGNORE_ATTR}]`)) return

    const action = resolveCtrlEnterAction(target)
    if (!action) return

    event.preventDefault()
    event.stopPropagation()
    if (action.kind === "button") action.button.click()
    else submitForm(action.form)
}

/** Só Ctrl + tecla, sem ⌘/Alt/Shift: no Mac ⌘+J/⌘+E têm outras funções e Ctrl+E já é nativo. */
function isPlainCtrl(event: KeyboardEvent, key: string): boolean {
    return event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === key
}

/** O evento é Ctrl+J (quebra de linha)? */
export function isCtrlJ(event: KeyboardEvent): boolean {
    return isPlainCtrl(event, "j")
}

/** O evento é Ctrl+E (fim da linha)? */
export function isCtrlE(event: KeyboardEvent): boolean {
    return isPlainCtrl(event, "e")
}

/**
 * Insere uma quebra de linha no cursor (substituindo a seleção), como o Enter. `execCommand` dispara o
 * `input` nativo e preserva o desfazer; na falta dele, `setRangeText` + `input` (o React detecta a
 * diferença de valor e chama o `onChange`). Respeita `maxLength`.
 */
export function insertLineBreak(textarea: HTMLTextAreaElement): void {
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const max = textarea.maxLength
    if (max >= 0 && textarea.value.length - (end - start) + 1 > max) return

    const inserted = typeof document.execCommand === "function" && document.execCommand("insertText", false, "\n")
    if (inserted) return
    textarea.setRangeText("\n", start, end, "end")
    textarea.dispatchEvent(new Event("input", { bubbles: true }))
}

/** Leva o cursor ao fim da linha lógica atual (até o próximo `\n`), desfazendo a seleção. */
export function moveCursorToLineEnd(textarea: HTMLTextAreaElement): void {
    const next = textarea.value.indexOf("\n", textarea.selectionEnd)
    const position = next === -1 ? textarea.value.length : next
    textarea.setSelectionRange(position, position)
}

/**
 * Alvo dos atalhos de edição: o `<textarea>` nativo com foco. Dentro do editor Vim quem trata
 * Ctrl+J/Ctrl+E no modo INSERT é o keymap do CodeMirror (o alvo ali é o conteúdo do editor).
 */
function shortcutTarget(event: KeyboardEvent): HTMLTextAreaElement | null {
    if (event.defaultPrevented || event.isComposing) return null
    const target = event.target
    if (!(target instanceof HTMLTextAreaElement)) return null
    return isEligible(target) ? target : null
}

/**
 * Handler global dos atalhos de edição: Ctrl+J insere quebra de linha e Ctrl+E vai ao fim da linha.
 * Previne o padrão para não abrir Downloads/busca do navegador; ignora textarea somente leitura/desabilitado.
 */
export function handleTextareaEditKey(event: KeyboardEvent): void {
    const lineBreak = isCtrlJ(event)
    if (!lineBreak && !isCtrlE(event)) return
    const target = shortcutTarget(event)
    if (!target || target.readOnly || target.disabled) return

    event.preventDefault()
    event.stopPropagation()
    if (lineBreak) insertLineBreak(target)
    else moveCursorToLineEnd(target)
}

/** Todos os atalhos de textarea num único listener. */
export function handleTextareaShortcutKey(event: KeyboardEvent): void {
    handleCtrlEnterKey(event)
    handleTextareaEditKey(event)
}

/**
 * Instala os atalhos de textarea globalmente (uma vez no layout raiz): Ctrl+Enter (ação principal do
 * campo) e Ctrl+J/Ctrl+E (edição). Renderiza `null`. Usa a fase de captura para resolver formulários
 * portalados (diálogos Radix em `document.body`).
 */
export function CtrlEnterSubmit(): null {
    useEffect(() => {
        document.addEventListener("keydown", handleTextareaShortcutKey, true)
        return () => document.removeEventListener("keydown", handleTextareaShortcutKey, true)
    }, [])
    return null
}
