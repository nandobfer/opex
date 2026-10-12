"use client"

import { useRef, useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { UploadCloud } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Área de envio de arquivos: clique para escolher (seleção múltipla) ou arraste e solte. O realce é
 * contado por profundidade para não piscar quando o ponteiro passa pelos elementos internos.
 */
export function AttachmentDropzone({
    onFiles,
    disabled = false,
    hint,
    className,
    children,
}: {
    onFiles: (files: FileList | File[]) => void
    disabled?: boolean
    /** Texto de apoio (limite por arquivo, formatos aceitos). */
    hint?: ReactNode
    className?: string
    children?: ReactNode
}) {
    const reduceMotion = useReducedMotion()
    const inputRef = useRef<HTMLInputElement>(null)
    const depth = useRef(0)
    const [dragging, setDragging] = useState(false)

    const open = () => {
        if (!disabled) inputRef.current?.click()
    }

    const reset = () => {
        depth.current = 0
        setDragging(false)
    }

    return (
        <div
            data-dragging={dragging ? "true" : undefined}
            onDragEnter={(event) => {
                if (disabled) return
                event.preventDefault()
                depth.current += 1
                setDragging(true)
            }}
            onDragOver={(event) => {
                if (disabled) return
                event.preventDefault()
                if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"
            }}
            onDragLeave={(event) => {
                if (disabled) return
                event.preventDefault()
                depth.current -= 1
                if (depth.current <= 0) setDragging(false)
            }}
            onDrop={(event) => {
                if (disabled) return
                event.preventDefault()
                const files = event.dataTransfer?.files
                reset()
                if (files && files.length > 0) onFiles(files)
            }}
            className={cn(
                "rounded-lg border border-dashed p-4 transition-colors",
                dragging ? "border-primary bg-primary/10" : "border-border bg-muted/20",
                disabled && "opacity-60",
                className,
            )}
        >
            <input
                ref={inputRef}
                type="file"
                multiple
                className="hidden"
                aria-label="Escolher arquivos para anexar"
                onChange={(event) => {
                    const files = event.target.files
                    if (files && files.length > 0) onFiles(files)
                    event.target.value = ""
                }}
            />
            <motion.div
                animate={dragging && !reduceMotion ? { scale: 1.01 } : { scale: 1 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col items-center gap-1.5 text-center"
            >
                <motion.span
                    animate={dragging && !reduceMotion ? { y: -2 } : { y: 0 }}
                    transition={{ duration: 0.15 }}
                    className={cn("flex h-10 w-10 items-center justify-center rounded-full", dragging ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground")}
                >
                    <UploadCloud className="h-5 w-5" aria-hidden />
                </motion.span>
                <p className="text-sm font-medium">
                    {dragging ? "Solte os arquivos aqui" : "Arraste os arquivos ou"}
                    {!dragging && (
                        <button type="button" onClick={open} disabled={disabled} className="ml-1 font-medium text-primary underline underline-offset-2 hover:text-primary/80 disabled:no-underline">
                            escolha do computador
                        </button>
                    )}
                </p>
                {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            </motion.div>
            {children}
        </div>
    )
}
