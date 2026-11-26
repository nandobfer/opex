"use client"

import { useRef, useState, type DragEvent, type ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { FileUp } from "lucide-react"

/**
 * Soltar arquivos sobre a conversa abre a prévia de envio (como no WhatsApp Web). Eventos nativos de arrastar: o Opex
 * não tem o `react-dropzone` do Atendimento e não precisa dele para isto.
 */
export function ChatDropzone({ disabled, onFiles, children }: { disabled: boolean; onFiles: (files: File[]) => void; children: ReactNode }) {
    const [active, setActive] = useState(false)
    const depth = useRef(0)
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files")
    return (
        <div
            className="relative flex min-h-0 flex-1 flex-col"
            data-testid="chat-dropzone"
            onDragEnter={(event) => {
                if (disabled || !hasFiles(event)) return
                event.preventDefault()
                depth.current += 1
                setActive(true)
            }}
            onDragOver={(event) => {
                if (!disabled && hasFiles(event)) event.preventDefault()
            }}
            onDragLeave={() => {
                depth.current = Math.max(0, depth.current - 1)
                if (depth.current === 0) setActive(false)
            }}
            onDrop={(event) => {
                if (disabled) return
                event.preventDefault()
                depth.current = 0
                setActive(false)
                const files = Array.from(event.dataTransfer?.files ?? [])
                if (files.length) onFiles(files)
            }}
        >
            {children}
            <AnimatePresence>
                {active && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-card/90 text-sm font-medium">
                        <FileUp className="h-8 w-8 text-primary" aria-hidden />
                        Solte os arquivos para enviar
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
