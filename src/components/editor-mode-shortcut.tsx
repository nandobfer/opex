"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { requestClipboardAccess } from "@/components/ui/vim-editor/clipboard"
import { useEditorMode } from "@/features/editor-mode/preference"
import { EDITOR_MODE_SHORTCUT_LABEL, isEditorModeToggle } from "@/features/editor-mode/shortcut"

/**
 * Instala o atalho global que alterna os campos de texto entre o `<textarea>` nativo e o modo Vim
 * (uma vez no layout raiz). Captura na janela para valer também dentro de diálogos e do editor.
 */
export function EditorModeShortcut(): null {
    const { toggle } = useEditorMode()
    const toggleRef = useRef(toggle)
    useEffect(() => {
        toggleRef.current = toggle
    }, [toggle])

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.repeat || event.isComposing || !isEditorModeToggle(event)) return
            event.preventDefault()
            event.stopPropagation()
            const next = toggleRef.current()
            if (next === "vim") {
                requestClipboardAccess()
                toast.success("Modo Vim ligado", { description: `Esc volta ao modo normal. ${EDITOR_MODE_SHORTCUT_LABEL} desliga.` })
            } else {
                toast.success("Modo Vim desligado", { description: "Os campos de texto voltaram ao normal." })
            }
        }
        window.addEventListener("keydown", onKeyDown, true)
        return () => window.removeEventListener("keydown", onKeyDown, true)
    }, [])
    return null
}
