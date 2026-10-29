"use client"

import { useRef, useState, type DragEvent, type ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Upload } from "lucide-react"
import { cn } from "@/lib/utils"

const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files")

/**
 * Área que aceita arquivos arrastados (mostra o destino animado enquanto arrasta). Por padrão ocupa a
 * coluna inteira (chat); `className` troca o layout (ex.: um campo de texto) e `label` o aviso.
 */
export function FileDropZone({ onFiles, disabled, children, className = "relative flex min-h-0 flex-1 flex-col", label = "Solte para anexar à mensagem", compact = false }: { onFiles: (files: File[]) => void; disabled?: boolean; children: ReactNode; className?: string; label?: string; compact?: boolean }) {
    const [dragging, setDragging] = useState(false)
    const depth = useRef(0)

    const reset = () => {
        depth.current = 0
        setDragging(false)
    }

    return (
        <div
            className={className}
            onDragEnter={(event) => {
                if (disabled || !hasFiles(event)) return
                event.preventDefault()
                depth.current++
                setDragging(true)
            }}
            onDragOver={(event) => {
                if (disabled || !hasFiles(event)) return
                event.preventDefault()
                event.dataTransfer.dropEffect = "copy"
            }}
            onDragLeave={(event) => {
                if (disabled || !hasFiles(event)) return
                depth.current = Math.max(0, depth.current - 1)
                if (depth.current === 0) setDragging(false)
            }}
            onDrop={(event) => {
                if (disabled || !hasFiles(event)) return
                event.preventDefault()
                reset()
                const files = Array.from(event.dataTransfer.files ?? [])
                if (files.length) onFiles(files)
            }}
        >
            {children}
            <AnimatePresence>
                {dragging && (
                    <motion.div
                        key="drop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className={cn("pointer-events-none absolute z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-primary/70 bg-primary/10 backdrop-blur-[2px]", compact ? "inset-0 flex-row gap-2" : "inset-2 flex-col gap-2")}
                    >
                        <motion.span
                            initial={{ y: 6, scale: 0.9 }}
                            animate={{ y: 0, scale: 1 }}
                            transition={{ type: "spring", stiffness: 300, damping: 20 }}
                            className={cn("flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg", compact ? "h-8 w-8" : "h-12 w-12")}
                        >
                            <Upload className={compact ? "h-4 w-4" : "h-6 w-6"} aria-hidden />
                        </motion.span>
                        <p className="text-sm font-medium">{label}</p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
