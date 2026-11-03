import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"

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
