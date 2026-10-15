"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { TEXTAREA_SHORTCUTS_IGNORE_ATTR } from "@/components/ctrl-enter-submit"
import { useEditorMode } from "@/features/editor-mode/preference"
import { EditorErrorBoundary } from "@/components/ui/vim-editor/EditorErrorBoundary"

const VimEditor = React.lazy(() => import("./vim-editor/VimEditor").then((module) => ({ default: module.VimEditor })))

/** O `<textarea>` continua no DOM (valor, label, formulário), fora da tela e fora do Tab. */
const HIDDEN_STYLE: React.CSSProperties = { position: "fixed", top: 0, left: 0, width: 1, height: 1, opacity: 0, pointerEvents: "none" }

export interface TextareaProps extends React.ComponentProps<"textarea"> {
    /** `false` mantém este campo sempre no modo nativo, mesmo com o modo Vim ligado. */
    vim?: boolean
}

/** Campos dentro do terminal ou de subárvores sem atalhos nunca viram editor Vim. */
function supportsVim(textarea: HTMLTextAreaElement): boolean {
    return !textarea.closest(`[${TEXTAREA_SHORTCUTS_IGNORE_ATTR}]`) && !textarea.closest(".xterm")
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, vim = true, style, tabIndex, ...props }, ref) => {
    const { mode, setMode } = useEditorMode()
    const [node, setNode] = React.useState<HTMLTextAreaElement | null>(null)
    const [editorReady, setEditorReady] = React.useState(false)
    const [editorFailed, setEditorFailed] = React.useState(false)

    const setRefs = React.useCallback(
        (element: HTMLTextAreaElement | null) => {
            setNode(element)
            if (typeof ref === "function") ref(element)
            else if (ref) ref.current = element
        },
        [ref],
    )

    // Sem o modo Vim, uma falha antiga não deve impedir uma nova tentativa na próxima vez que ligar.
    React.useEffect(() => {
        if (mode !== "vim") setEditorFailed(false)
    }, [mode])

    const active = mode === "vim" && vim && node !== null && supportsVim(node) && !editorFailed
    const hidden = active && editorReady
    const exit = React.useCallback(() => setMode("native"), [setMode])

    return (
        <>
            <textarea
                className={cn(
                    "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
                    className
                )}
                ref={setRefs}
                style={hidden ? { ...style, ...HIDDEN_STYLE } : style}
                tabIndex={hidden ? -1 : tabIndex}
                aria-hidden={hidden ? true : undefined}
                {...props}
            />
            {active ? (
                <React.Suspense fallback={null}>
                    <EditorErrorBoundary onError={() => setEditorFailed(true)}>
                        <VimEditor
                            textarea={node}
                            className={className}
                            rows={props.rows}
                            disabled={props.disabled}
                            readOnly={props.readOnly}
                            placeholder={props.placeholder}
                            onReady={setEditorReady}
                            onExit={exit}
                        />
                    </EditorErrorBoundary>
                </React.Suspense>
            ) : null}
        </>
    )
})
Textarea.displayName = "Textarea"

export { Textarea }
