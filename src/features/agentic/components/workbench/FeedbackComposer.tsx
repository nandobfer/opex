"use client"

import type { ReactNode } from "react"
import { motion } from "framer-motion"
import { Loader2, Send, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { FieldAttachments } from "../../hooks/useWorkbenchFiles"
import { AttachableTextarea } from "./AttachableTextarea"

/** Texto do campo de feedback de uma ação (título, exemplo e botão de envio). */
export interface FeedbackCopy {
    title: string
    placeholder: string
    submit: string
}

/** Campo sem anexos (ex.: "Pedir ajustes" do Agente Arquiteto). */
export const NO_ATTACHMENTS: FieldAttachments = { available: false, items: [], onFiles: () => undefined, onRetry: () => undefined, onRemove: () => undefined, fileIds: [], blockReason: null, clearSent: () => undefined }

/**
 * Campo de correção/feedback da mesa (vai para o planejador), com anexos. O texto continua obrigatório
 * (mínimo 3 caracteres); o envio espera os anexos terminarem de subir. `aside` fica ao lado dos botões
 * (ex.: o slider de profundidade do Agente Arquiteto).
 */
export function FeedbackComposer({
    copy,
    value,
    onValueChange,
    attachments = NO_ATTACHMENTS,
    pending,
    onCancel,
    onSubmit,
    id = "workbench-feedback",
    aside,
}: {
    copy: FeedbackCopy
    value: string
    onValueChange: (value: string) => void
    attachments?: FieldAttachments
    pending: boolean
    onCancel: () => void
    onSubmit: (text: string) => void
    id?: string
    aside?: ReactNode
}) {
    const blocked = attachments.blockReason
    return (
        <motion.div key="composer" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="space-y-2 overflow-hidden">
            <label htmlFor={id} className="text-sm font-medium">
                {copy.title}
            </label>
            <AttachableTextarea id={id} autoFocus rows={4} value={value} onValueChange={onValueChange} placeholder={copy.placeholder} attachments={attachments} />
            <div className="flex flex-wrap items-center justify-end gap-2">
                {aside && <div className="mr-auto min-w-0 flex-1">{aside}</div>}
                <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={onCancel} disabled={pending}>
                    <X className="h-3.5 w-3.5" aria-hidden /> Cancelar
                </Button>
                <Button type="button" data-ctrl-enter-submit size="sm" className="gap-1.5" disabled={pending || value.trim().length < 3 || Boolean(blocked)} title={blocked ?? undefined} onClick={() => onSubmit(value.trim())}>
                    {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />}
                    {copy.submit}
                </Button>
            </div>
        </motion.div>
    )
}
