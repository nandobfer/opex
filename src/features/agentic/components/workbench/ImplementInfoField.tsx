"use client"

import { motion } from "framer-motion"
import { REPLY_PRIORITY } from "@/components/agent-reply/ReplyTargetProvider"
import type { FieldAttachments } from "../../hooks/useWorkbenchFiles"
import { AttachableTextarea } from "./AttachableTextarea"

const IMPLEMENT_HINT = "Essas informações (e os arquivos anexados) são enviadas ao agente junto do plano aprovado, no prompt de implementação."

interface ImplementInfoFieldProps {
    value: string
    onValueChange: (value: string) => void
    attachments: FieldAttachments
    id?: string
    /** Explicação de para onde as informações vão (padrão: o prompt de implementação). */
    hint?: string
}

/**
 * "Informações adicionais" opcionais (texto e anexos) de uma ação da mesa: ao aprovar o plano vão no
 * prompt de implementação; em "Especificação pronta", no "Gerar plano" (OPE-137).
 */
export function ImplementInfoField({ value, onValueChange, attachments, id = "workbench-implement-info", hint = IMPLEMENT_HINT }: ImplementInfoFieldProps) {
    return (
        <motion.div key="implement-info" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="space-y-1.5 overflow-hidden">
            <label htmlFor={id} className="text-sm font-medium">
                Informações adicionais (opcional)
            </label>
            <AttachableTextarea id={id} rows={3} value={value} onValueChange={onValueChange} replyPriority={REPLY_PRIORITY.extra} placeholder="Ex.: regras de negócio, decisões, links, o que evitar…" attachments={attachments} />
            <p className="text-xs text-muted-foreground">{hint}</p>
        </motion.div>
    )
}
