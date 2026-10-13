"use client"

import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { AlertCircle, Download, FilePlus2, Trash2 } from "lucide-react"
import { formatAttachmentSize, isAttachmentReferenced } from "@/lib/attachments"
import { withBasePath } from "@/lib/base-path"
import { formatDateTime } from "@/features/tasks/format"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { TaskAttachmentDto } from "../types"
import { AttachmentThumb } from "./AttachmentThumb"

interface AttachmentListProps {
    attachments: readonly TaskAttachmentDto[]
    /** Descrição da tarefa: avisa quando o anexo está referenciado nela. */
    description?: string | null
    /** Só o dono exclui anexos já vinculados. */
    canDelete?: boolean
    onDelete?: (attachment: TaskAttachmentDto) => void
    deleting?: boolean
    loading?: boolean
    error?: string | null
    onRetry?: () => void
}

/** Lista dos anexos confirmados, com baixar (download) e excluir (só o dono). */
export function AttachmentList({ attachments, description, canDelete = false, onDelete, deleting = false, loading = false, error = null, onRetry }: AttachmentListProps) {
    const reduceMotion = useReducedMotion()
    const [pending, setPending] = useState<TaskAttachmentDto | null>(null)
    const referenced = pending ? isAttachmentReferenced(description, pending.id) : false

    if (loading) {
        return (
            <div className="space-y-2" aria-label="Carregando anexos">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
            </div>
        )
    }

    if (error) {
        return (
            <p className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" aria-hidden /> {error}
                {onRetry && (
                    <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                        Tentar novamente
                    </Button>
                )}
            </p>
        )
    }

    if (attachments.length === 0) {
        return (
            <p className="flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                <FilePlus2 className="h-4 w-4" aria-hidden /> Nenhum anexo ainda.
            </p>
        )
    }

    return (
        <>
            <motion.ul variants={reduceMotion ? undefined : { visible: { transition: { staggerChildren: 0.03 } } }} initial="hidden" animate="visible" className="space-y-2">
                <AnimatePresence initial={false}>
                    {attachments.map((attachment) => {
                        const url = withBasePath(attachment.url)
                        return (
                            <motion.li
                                key={attachment.id}
                                layout={!reduceMotion}
                                initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, x: reduceMotion ? 0 : -8 }}
                                transition={{ duration: 0.18 }}
                                className="flex items-center gap-3 rounded-md border bg-card p-2"
                            >
                                <AttachmentThumb kind={attachment.kind} src={attachment.kind === "image" ? url : null} />
                                <div className="min-w-0 flex-1">
                                    <a href={url} target="_blank" rel="noreferrer" className="block truncate text-sm text-primary underline underline-offset-2 hover:text-primary/80" title={attachment.name}>
                                        {attachment.name}
                                    </a>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {formatAttachmentSize(attachment.size)} · {attachment.uploaderName}
                                        {attachment.createdAt ? ` · ${formatDateTime(attachment.createdAt)}` : ""}
                                    </p>
                                </div>
                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" asChild>
                                    <a href={`${url}?download=1`} aria-label={`Baixar ${attachment.name}`} title="Baixar">
                                        <Download className="h-4 w-4" aria-hidden />
                                    </a>
                                </Button>
                                {canDelete && onDelete && (
                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setPending(attachment)} aria-label={`Excluir ${attachment.name}`} title="Excluir anexo">
                                        <Trash2 className="h-4 w-4" aria-hidden />
                                    </Button>
                                )}
                            </motion.li>
                        )
                    })}
                </AnimatePresence>
            </motion.ul>

            <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir o anexo “{pending?.name}”?</AlertDialogTitle>
                        <AlertDialogDescription>
                            O arquivo é removido do storage e não dá para desfazer.
                            {referenced && " Ele está referenciado na descrição da tarefa: a referência vai ficar sem conteúdo."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-white hover:bg-destructive/90"
                            disabled={deleting}
                            onClick={(event) => {
                                event.preventDefault()
                                if (pending) onDelete?.(pending)
                                setPending(null)
                            }}
                        >
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
