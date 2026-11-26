"use client"

import { useEffect } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react"
import type { ChatMessageDto } from "@/features/evolution-api/chat-message"
import { mediaSrc } from "./bubble/MediaContent"

interface MediaViewerProps {
    chatId: string
    /** Fotos e vídeos da conversa, em ordem. */
    items: ChatMessageDto[]
    openId: string | null
    onOpenChange: (id: string | null) => void
    contactName: string
}

/** Visualizador em tela cheia (como no WhatsApp Web, cópia do Atendimento): setas navegam, Esc fecha. */
export function MediaViewer({ chatId, items, openId, onOpenChange, contactName }: MediaViewerProps) {
    const reduceMotion = useReducedMotion()
    const index = items.findIndex((item) => item.id === openId)
    const current = index >= 0 ? items[index] : undefined
    const go = (delta: number) => {
        const next = items[index + delta]
        if (next) onOpenChange(next.id)
    }
    useEffect(() => {
        if (!current) return
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "ArrowLeft") go(-1)
            if (event.key === "ArrowRight") go(1)
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    })
    const src = current ? mediaSrc(chatId, current) : null
    return (
        <DialogPrimitive.Root open={Boolean(current)} onOpenChange={(open) => !open && onOpenChange(null)}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/95" />
                <DialogPrimitive.Content className="fixed inset-0 z-50 flex flex-col outline-none" aria-describedby={undefined}>
                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                            <DialogPrimitive.Title className="truncate text-sm font-semibold">{current?.fromMe ? "Você" : contactName}</DialogPrimitive.Title>
                            {current && <p className="text-xs text-muted-foreground">{format(new Date(current.timestamp), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>}
                        </div>
                        <div className="flex items-center gap-1">
                            {src && (
                                <a href={src} download className="rounded-full p-2 hover:bg-foreground/10" aria-label="Baixar">
                                    <Download className="h-5 w-5" aria-hidden />
                                </a>
                            )}
                            <DialogPrimitive.Close className="rounded-full p-2 hover:bg-foreground/10" aria-label="Fechar">
                                <X className="h-5 w-5" aria-hidden />
                            </DialogPrimitive.Close>
                        </div>
                    </div>
                    <div className="relative flex min-h-0 flex-1 items-center justify-center px-14 pb-6">
                        {index > 0 && (
                            <button type="button" onClick={() => go(-1)} className="absolute left-3 rounded-full bg-foreground/10 p-2 hover:bg-foreground/20" aria-label="Anterior">
                                <ChevronLeft className="h-6 w-6" aria-hidden />
                            </button>
                        )}
                        <AnimatePresence mode="wait" initial={false}>
                            {current && src && (
                                <motion.div key={current.id} initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="flex max-h-full max-w-full flex-col items-center gap-3">
                                    {current.media?.kind === "video" ? (
                                        <video src={src} controls autoPlay playsInline className="max-h-[75vh] max-w-full rounded" />
                                    ) : (
                                        // eslint-disable-next-line @next/next/no-img-element -- rota autenticada
                                        <img src={src} alt={current.text || "Foto"} className="max-h-[75vh] max-w-full rounded object-contain" />
                                    )}
                                    {current.text && <p className="max-w-2xl whitespace-pre-wrap text-center text-sm">{current.text}</p>}
                                </motion.div>
                            )}
                        </AnimatePresence>
                        {index >= 0 && index < items.length - 1 && (
                            <button type="button" onClick={() => go(1)} className="absolute right-3 rounded-full bg-foreground/10 p-2 hover:bg-foreground/20" aria-label="Próxima">
                                <ChevronRight className="h-6 w-6" aria-hidden />
                            </button>
                        )}
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    )
}
