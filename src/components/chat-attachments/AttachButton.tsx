"use client"

import { useRef, type ClipboardEvent } from "react"
import { Paperclip } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Arquivos colados no campo de texto: entrega à fila e impede que o navegador cole o nome do arquivo. */
export function pasteFiles(event: ClipboardEvent<HTMLElement>, onFiles: (files: File[]) => void, disabled = false): void {
    const files = Array.from(event.clipboardData?.files ?? [])
    if (!files.length || disabled) return
    event.preventDefault()
    onFiles(files)
}

/** Botão de clipe que abre o seletor de arquivos do sistema (vários de uma vez). */
export function AttachButton({ onFiles, disabled, className, title = "Anexar arquivos (ou cole/arraste no campo)" }: { onFiles: (files: File[]) => void; disabled?: boolean; className?: string; title?: string }) {
    const inputRef = useRef<HTMLInputElement>(null)
    return (
        <>
            <input
                ref={inputRef}
                type="file"
                multiple
                hidden
                tabIndex={-1}
                aria-hidden
                onChange={(event) => {
                    const files = Array.from(event.target.files ?? [])
                    event.target.value = ""
                    if (files.length) onFiles(files)
                }}
            />
            <Button
                type="button"
                size="icon"
                variant="ghost"
                className={cn("h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground", className)}
                onClick={() => inputRef.current?.click()}
                disabled={disabled}
                aria-label="Anexar arquivos"
                title={title}
            >
                <Paperclip className="h-4 w-4" aria-hidden />
            </Button>
        </>
    )
}
