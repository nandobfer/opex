"use client"

import { useEffect } from "react"

/** Botão a acionar quando o campo multiline não tem `<form>` (ou o `<form>` não é o da feature). */
export const CTRL_ENTER_SUBMIT_ATTR = "data-ctrl-enter-submit"
/** Contêiner que envolve campo + botão: torna a resolução determinística quando o botão não é ancestral direto. */
export const CTRL_ENTER_SCOPE_ATTR = "data-ctrl-enter-scope"
/** Desliga o atalho numa subárvore (reserva; o terminal `.xterm` já é ignorado por padrão). */
export const CTRL_ENTER_IGNORE_ATTR = "data-ctrl-enter-ignore"

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

/**
 * Handler global do Ctrl+Enter: age só em `<textarea>` fora do terminal (`.xterm`) e de subárvores
 * marcadas com `data-ctrl-enter-ignore`. Sem alvo resolvido, não previne o padrão (o navegador segue).
 */
export function handleCtrlEnterKey(event: KeyboardEvent): void {
    if (!isCtrlEnter(event)) return
    if (event.defaultPrevented || event.isComposing) return

    const target = event.target
    if (!(target instanceof HTMLTextAreaElement)) return
    if (target.closest(`[${CTRL_ENTER_IGNORE_ATTR}]`) || target.closest(".xterm")) return

    const action = resolveCtrlEnterAction(target)
    if (!action) return

    event.preventDefault()
    event.stopPropagation()
    if (action.kind === "button") action.button.click()
    else submitForm(action.form)
}

/**
 * Instala o atalho Ctrl+Enter globalmente (uma vez no layout raiz). Renderiza `null`. Usa a fase de
 * captura para resolver formulários portalados (diálogos Radix em `document.body`).
 */
export function CtrlEnterSubmit(): null {
    useEffect(() => {
        document.addEventListener("keydown", handleCtrlEnterKey, true)
        return () => document.removeEventListener("keydown", handleCtrlEnterKey, true)
    }, [])
    return null
}
