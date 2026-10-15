"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { Compartment, EditorSelection, EditorState, Prec } from "@codemirror/state"
import { EditorView, drawSelection, keymap, placeholder as placeholderExtension } from "@codemirror/view"
import { getCM, vim } from "@replit/codemirror-vim"
import { cn } from "@/lib/utils"
import { useLineNumbers } from "@/features/editor-mode/line-numbers"
import { ModeBadge } from "./ModeBadge"
import { VIM_HOST_ATTR, registerVimHost } from "./host"
import { minimalChange, mirrorSelection, watchExternalValue, writeTextareaValue } from "./sync"
import { configureVim, currentVimMode, enterInsertMode, escapeBelongsToVim, modeFromChange, pullSystemClipboard, sendVimEscape, vimInsertLineBreak, vimLineEnd, type VimMode } from "./vim-setup"
import { vimTheme } from "./theme"
import { lineNumbersExtension } from "./line-numbers"
import { accessibleName, editableExtensions, forwardFiles, hostClassName } from "./dom"

export interface VimEditorProps {
    /** `<textarea>` escondido que guarda o valor do campo. */
    textarea: HTMLTextAreaElement
    className?: string
    rows?: number
    disabled?: boolean
    readOnly?: boolean
    placeholder?: string
    /** Avisado quando o editor assume (`true`) ou devolve (`false`) o campo. */
    onReady: (ready: boolean) => void
    /** Volta ao campo normal (clique no selo de modo). */
    onExit: () => void
}

const clamp = (value: number, max: number) => Math.max(0, Math.min(value, max))

/**
 * Editor CodeMirror com atalhos do Vim no lugar do `<textarea>`. O valor continua no `<textarea>`
 * (escondido pelo `Textarea`): cada edição é escrita nele com `input`, e atribuições externas ao
 * `value` voltam para o editor.
 */
export function VimEditor({ textarea, className, rows = 2, disabled, readOnly, placeholder, onReady, onExit }: VimEditorProps) {
    const hostRef = useRef<HTMLDivElement>(null)
    const viewRef = useRef<EditorView | null>(null)
    const [compartments] = useState(() => ({ editable: new Compartment(), placeholder: new Compartment(), lineNumbers: new Compartment() }))
    const lineNumbers = useLineNumbers()
    const initial = useRef({ disabled, readOnly, placeholder, lineNumbers })
    const callbacks = useRef({ onReady })
    const [mode, setMode] = useState<VimMode>("normal")

    useEffect(() => {
        callbacks.current = { onReady }
    }, [onReady])

    useLayoutEffect(() => {
        const host = hostRef.current
        if (!host) return
        configureVim()

        const hadFocus = document.activeElement === textarea
        const length = textarea.value.length
        const cursor = clamp(textarea.selectionStart ?? length, length)
        let applyingExternal = false

        const view = new EditorView({
            parent: host,
            state: EditorState.create({
                doc: textarea.value,
                selection: EditorSelection.cursor(cursor),
                extensions: [
                    vim(),
                    // O Vim esconde a seleção nativa: a camada desenhada mostra o modo visual.
                    drawSelection(),
                    compartments.lineNumbers.of(lineNumbersExtension(initial.current.lineNumbers)),
                    Prec.highest(
                        keymap.of([
                            { key: "Ctrl-j", run: (v) => currentVimMode(v) === "insert" && vimInsertLineBreak(v) },
                            { key: "Ctrl-e", run: (v) => currentVimMode(v) === "insert" && vimLineEnd(v) },
                        ]),
                    ),
                    history(),
                    keymap.of([...defaultKeymap, ...historyKeymap]),
                    EditorView.lineWrapping,
                    compartments.editable.of(editableExtensions(initial.current.disabled, initial.current.readOnly)),
                    compartments.placeholder.of(initial.current.placeholder ? placeholderExtension(initial.current.placeholder) : []),
                    vimTheme,
                    EditorView.contentAttributes.of({ "aria-multiline": "true", "aria-label": accessibleName(textarea) }),
                    EditorView.updateListener.of((update) => {
                        if (update.docChanged && !applyingExternal) writeTextareaValue(textarea, update.state.doc.toString())
                        if (update.docChanged || update.selectionSet) {
                            const { from, to } = update.state.selection.main
                            mirrorSelection(textarea, from, to)
                        }
                    }),
                    EditorView.domEventHandlers({
                        focus: () => {
                            void pullSystemClipboard()
                            return false
                        },
                        paste: (event, v) => forwardFiles(textarea, v, event, "paste"),
                        drop: (event, v) => forwardFiles(textarea, v, event, "drop"),
                    }),
                ],
            }),
        })
        viewRef.current = view
        const unregister = registerVimHost(host, textarea)

        const cm = getCM(view)
        const onModeChange = (event: { mode?: string; subMode?: string }) => setMode(modeFromChange(event))
        cm?.on("vim-mode-change", onModeChange)

        const unwatch = watchExternalValue(textarea, (value) => {
            const change = minimalChange(view.state.doc.toString(), value)
            if (!change) return
            applyingExternal = true
            try {
                view.dispatch({ changes: change })
            } finally {
                applyingExternal = false
            }
        })

        // Foco no `<textarea>` (label, barra de formatação) vai para o editor, com a seleção pedida.
        const onTextareaFocus = () => {
            view.focus()
            queueMicrotask(() => {
                const max = view.state.doc.length
                view.dispatch({ selection: EditorSelection.range(clamp(textarea.selectionStart, max), clamp(textarea.selectionEnd, max)) })
            })
        }
        textarea.addEventListener("focus", onTextareaFocus)

        // Esc em inserção/visual/comando pendente fica no editor e não fecha o diálogo em volta: a
        // captura na janela roda antes do listener do Radix (captura no documento).
        const onEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return
            if (!(event.target instanceof Node) || !view.dom.contains(event.target)) return
            if (getCM(view)?.state.dialog && event.target instanceof HTMLInputElement) {
                event.preventDefault()
                event.stopPropagation()
                event.target.blur()
                return
            }
            if (!escapeBelongsToVim(view)) return
            event.preventDefault()
            event.stopPropagation()
            sendVimEscape(view)
            setMode(currentVimMode(view))
        }
        window.addEventListener("keydown", onEscape, true)

        callbacks.current.onReady(true)
        if (hadFocus) {
            view.focus()
            enterInsertMode(view)
            setMode(currentVimMode(view))
        }

        return () => {
            const focused = view.hasFocus
            window.removeEventListener("keydown", onEscape, true)
            textarea.removeEventListener("focus", onTextareaFocus)
            cm?.off("vim-mode-change", onModeChange)
            unwatch()
            unregister()
            view.destroy()
            viewRef.current = null
            callbacks.current.onReady(false)
            if (focused) {
                requestAnimationFrame(() => {
                    if (textarea.isConnected) textarea.focus()
                })
            }
        }
    }, [textarea, compartments])

    useEffect(() => {
        viewRef.current?.dispatch({ effects: compartments.editable.reconfigure(editableExtensions(disabled, readOnly)) })
    }, [disabled, readOnly, compartments])

    useEffect(() => {
        viewRef.current?.dispatch({ effects: compartments.lineNumbers.reconfigure(lineNumbersExtension(lineNumbers)) })
    }, [lineNumbers, compartments])

    useEffect(() => {
        viewRef.current?.dispatch({ effects: compartments.placeholder.reconfigure(placeholder ? placeholderExtension(placeholder) : []) })
    }, [placeholder, compartments])

    return (
        <div
            ref={hostRef}
            {...{ [VIM_HOST_ATTR]: "" }}
            data-disabled={disabled ? "" : undefined}
            style={{ minHeight: `calc(${rows} * 1.25rem + 1rem + 2px)` }}
            className={cn(
                "relative flex w-full min-h-[60px] rounded-md border border-input bg-transparent px-3 py-2 pb-5 text-sm shadow-sm focus-within:outline-none focus-within:ring-1 focus-within:ring-ring data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
                hostClassName(className),
            )}
        >
            <ModeBadge mode={mode} onExit={onExit} />
        </div>
    )
}
