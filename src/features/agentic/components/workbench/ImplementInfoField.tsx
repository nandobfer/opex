"use client"

import { motion } from "framer-motion"
import { REPLY_PRIORITY } from "@/components/agent-reply/ReplyTargetProvider"
import type { FieldAttachments } from "../../hooks/useWorkbenchFiles"
import { AttachableTextarea } from "./AttachableTextarea"

/** "Informações adicionais" ao aprovar o plano: texto e anexos opcionais que vão no prompt de implementação. */
export function ImplementInfoField({ value, onValueChange, attachments }: { value: string; onValueChange: (value: string) => void; attachments: FieldAttachments }) {
    return (
        <motion.div key="implement-info" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="space-y-1.5 overflow-hidden">
            <label htmlFor="workbench-implement-info" className="text-sm font-medium">
                Informações adicionais (opcional)
            </label>
            <AttachableTextarea id="workbench-implement-info" rows={3} value={value} onValueChange={onValueChange} replyPriority={REPLY_PRIORITY.extra} placeholder="Ex.: regras de negócio, decisões, links, o que evitar…" attachments={attachments} />
            <p className="text-xs text-muted-foreground">Essas informações (e os arquivos anexados) são enviadas ao agente junto do plano aprovado, no prompt de implementação.</p>
        </motion.div>
    )
}
