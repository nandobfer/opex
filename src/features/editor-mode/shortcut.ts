/**
 * Atalhos que alternam o modo de edição dos campos de texto. O Ctrl+Tab é o principal, mas numa aba
 * comum o navegador o reserva (troca de aba) e a página nunca o recebe; o Ctrl+Shift+Alt+V funciona
 * em qualquer lugar.
 */
export const EDITOR_MODE_SHORTCUT_LABEL = "Ctrl+Tab ou Ctrl+Shift+Alt+V"

/** O evento é um dos atalhos de alternância do modo de edição? */
export function isEditorModeToggle(event: KeyboardEvent): boolean {
    if (!event.ctrlKey || event.metaKey) return false
    if (event.key === "Tab") return !event.shiftKey && !event.altKey
    return event.shiftKey && event.altKey && event.code === "KeyV"
}
