"use client"

import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { AlertCircle, Check, Loader2, RotateCcw, X } from "lucide-react"
import { attachmentKindOf, formatAttachmentSize } from "@/lib/attachments"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import type { AttachmentUploadItem } from "../hooks"
import { AttachmentThumb } from "./AttachmentThumb"

/** Fila de envio: progresso real de cada arquivo, com cancelar, tentar de novo e dispensar. */
export function AttachmentQueue({
    items,
    onCancel,
    onRetry,
    onDismiss,
    hideInline = false,
}: {
    items: readonly AttachmentUploadItem[]
    onCancel: (id: string) => void
    onRetry: (id: string) => void
    onDismiss: (id: string) => void
    /** Esconde a mídia enviada pelo campo Markdown (o progresso dela aparece no próprio campo). */
    hideInline?: boolean
}) {
    const reduceMotion = useReducedMotion()
    const visible = hideInline ? items.filter((item) => !item.inline) : items
    if (visible.length === 0) return null

    return (
        <ul className="mt-3 space-y-2" aria-label="Envios de anexos">
            <AnimatePresence initial={false}>
                {visible.map((item) => {
                    const kind = attachmentKindOf(item.mimeType)
                    const done = item.status === "done"
                    const failed = item.status === "error"
                    const canceled = item.status === "canceled"
                    return (
                        <motion.li
                            key={item.id}
                            layout={!reduceMotion}
                            initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: reduceMotion ? 0 : -8 }}
                            transition={{ duration: 0.18 }}
                            className="flex items-center gap-3 rounded-md border bg-card p-2"
                        >
                            <AttachmentThumb kind={kind} src={item.previewUrl} />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="truncate text-sm" title={item.name}>
                                        {item.name}
                                    </span>
                                    <span className="shrink-0 text-xs text-muted-foreground">{formatAttachmentSize(item.size)}</span>
                                </div>
                                {done ? (
                                    <p className="flex items-center gap-1 text-xs text-emerald-400">
                                        <Check className="h-3 w-3" aria-hidden /> Enviado
                                    </p>
                                ) : failed ? (
                                    <p className="flex items-center gap-1 text-xs text-destructive">
                                        <AlertCircle className="h-3 w-3" aria-hidden /> {item.error ?? "Falha no envio"}
                                    </p>
                                ) : canceled ? (
                                    <p className="text-xs text-muted-foreground">Cancelado</p>
                                ) : (
                                    <div className="mt-1 flex items-center gap-2">
                                        <Progress value={item.progress} className="h-1.5" />
                                        <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                                            {item.status === "confirming" ? "Confirmando…" : `${item.progress}%`}
                                        </span>
                                    </div>
                                )}
                            </div>
                            {failed && (
                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => onRetry(item.id)} aria-label={`Tentar enviar ${item.name} novamente`} title="Tentar novamente">
                                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                                </Button>
                            )}
                            {done || failed || canceled ? (
                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDismiss(item.id)} aria-label={`Dispensar ${item.name} da lista`} title="Dispensar">
                                    <X className="h-3.5 w-3.5" aria-hidden />
                                </Button>
                            ) : (
                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => onCancel(item.id)} aria-label={`Cancelar o envio de ${item.name}`} title="Cancelar">
                                    <X className="h-3.5 w-3.5" aria-hidden />
                                </Button>
                            )}
                            {!done && !failed && !canceled && item.status !== "queued" && <Loader2 className={cn("h-3.5 w-3.5 animate-spin text-muted-foreground")} aria-hidden />}
                        </motion.li>
                    )
                })}
            </AnimatePresence>
        </ul>
    )
}
