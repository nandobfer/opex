import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { fileTargetOf } from "./file-target"
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
 * Colar/arrastar arquivos no editor entrega os arquivos ao campo, na posição do cursor (ou do ponto
 * de soltura). Com destino registrado (`registerFileTarget`, ex.: envio de mídia do `MarkdownField`)
 * o handler é chamado direto, com os arquivos lidos do evento original; sem destino, o mesmo evento
 * é repetido no `<textarea>` como reserva. `true` quando o campo assumiu os arquivos.
 */
export function forwardFiles(textarea: HTMLTextAreaElement, view: EditorView, event: ClipboardEvent | DragEvent, type: "paste" | "drop"): boolean {
    // Os guards `typeof … === "function"` mantêm o encaminhamento inerte onde a classe não existe
    // (jsdom e alguns webviews), em vez de lançar.
    const drag = typeof DragEvent === "function" && event instanceof DragEvent
    const data = drag ? (event as DragEvent).dataTransfer : (event as ClipboardEvent).clipboardData
    const files = Array.from(data?.files ?? []).filter((file) => file.size > 0)
    if (!data || files.length === 0) return false
    const at = drag ? (view.posAtCoords({ x: (event as DragEvent).clientX, y: (event as DragEvent).clientY }) ?? view.state.selection.main.head) : view.state.selection.main.head
    mirrorSelection(textarea, at, at)
    const target = fileTargetOf(textarea)
    if (target) {
        if (!target(files, at)) return false
        event.preventDefault()
        return true
    }
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
