"use client"

import { useEffect, type RefObject } from "react"
import { registerMarkdownSource, selectionClipboard } from "@/lib/markdown/copy"

let installs = 0

const editableFocus = () => {
    const active = document.activeElement
    return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || (active instanceof HTMLElement && active.isContentEditable)
}

/** Copiar (Ctrl+C, menu, toque) com a seleção num `Markdown`: `text/plain` em Markdown e `text/html` do trecho. */
export function handleMarkdownCopy(event: ClipboardEvent): void {
    if (event.defaultPrevented || !event.clipboardData || editableFocus()) return
    const content = selectionClipboard(window.getSelection())
    if (!content) return
    event.clipboardData.setData("text/plain", content.text)
    event.clipboardData.setData("text/html", content.html)
    event.preventDefault()
}

/**
 * Registra o texto-fonte da raiz do `Markdown` e mantém um único listener `copy` no documento enquanto
 * houver algum `Markdown` montado (contagem de referências).
 */
export function useMarkdownCopy(rootRef: RefObject<HTMLElement | null>, source: string): void {
    useEffect(() => {
        if (rootRef.current) registerMarkdownSource(rootRef.current, source)
    }, [rootRef, source])

    useEffect(() => {
        if (installs++ === 0) document.addEventListener("copy", handleMarkdownCopy)
        return () => {
            if (--installs === 0) document.removeEventListener("copy", handleMarkdownCopy)
        }
    }, [])
}
