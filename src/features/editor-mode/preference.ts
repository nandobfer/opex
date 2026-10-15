"use client"

import { useCallback } from "react"
import { z } from "zod"
import { usePersistentState } from "@/hooks/usePersistentState"

/** Modo dos campos de texto multilinha: o `<textarea>` nativo ou o editor com atalhos do Vim. */
export const editorModeSchema = z.enum(["native", "vim"])
export type EditorMode = z.infer<typeof editorModeSchema>

export const EDITOR_MODE_KEY = "opex:editor-mode:v1"
export const DEFAULT_EDITOR_MODE: EditorMode = "native"

/** Preferência global (todos os campos, todas as abas) do modo de edição, salva no navegador. */
export function useEditorMode(): { mode: EditorMode; setMode: (mode: EditorMode) => void; toggle: () => EditorMode; ready: boolean } {
    const { value, setValue, ready } = usePersistentState(EDITOR_MODE_KEY, editorModeSchema, DEFAULT_EDITOR_MODE)
    const toggle = useCallback(() => {
        const next: EditorMode = value === "vim" ? "native" : "vim"
        setValue(next)
        return next
    }, [value, setValue])
    return { mode: value, setMode: setValue, toggle, ready }
}
