import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { mirrorSelection } from "./sync"

/** Classes do `<textarea>` trocadas para o contêiner: o anel de foco passa a ser `focus-within`. */
export function hostClassName(className: string | undefined): string {
    return (className ?? "").replace(/focus-visible:/g, "focus-within:")
}

/** Nome acessível do editor visível: o mesmo `<label>`/`aria-label`/placeholder do `<textarea>`. */
export function accessibleName(textarea: HTMLTextAreaElement): string {
    return textarea.getAttribute("aria-label") || textarea.labels?.[0]?.textContent?.trim() || textarea.placeholder || "Campo de texto"
}

/** `disabled` e `readOnly` do `<textarea>` traduzidos para o estado do editor. */
export function editableExtensions(disabled: boolean | undefined, readOnly: boolean | undefined) {
    return [EditorView.editable.of(!disabled), EditorState.readOnly.of(Boolean(disabled || readOnly))]
}

/**
 * Colar/arrastar arquivos no editor dispara o mesmo evento no `<textarea>`, para os handlers do
 * campo (ex.: envio de mídia do `MarkdownField`) rodarem com a posição do cursor certa.
 */
export function forwardFiles(textarea: HTMLTextAreaElement, view: EditorView, event: ClipboardEvent | DragEvent, type: "paste" | "drop"): boolean {
    // Os guards `typeof … === "function"` mantêm o encaminhamento inerte onde a classe não existe
    // (jsdom e alguns webviews), em vez de lançar.
    const drag = typeof DragEvent === "function" && event instanceof DragEvent
    const data = drag ? (event as DragEvent).dataTransfer : (event as ClipboardEvent).clipboardData
    if (!data || !Array.from(data.files ?? []).some((file) => file.size > 0)) return false
    const at = drag ? (view.posAtCoords({ x: (event as DragEvent).clientX, y: (event as DragEvent).clientY }) ?? view.state.selection.main.head) : view.state.selection.main.head
    mirrorSelection(textarea, at, at)
    const forwarded =
        type === "paste" && typeof ClipboardEvent === "function"
            ? new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true })
            : drag && typeof DragEvent === "function"
              ? new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true, clientX: (event as DragEvent).clientX, clientY: (event as DragEvent).clientY })
              : null
    if (!forwarded) return false
    textarea.dispatchEvent(forwarded)
    if (!forwarded.defaultPrevented) return false
    event.preventDefault()
    return true
}
