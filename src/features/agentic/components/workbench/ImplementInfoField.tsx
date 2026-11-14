"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { ChevronDown, Plus } from "lucide-react"
import { REPLY_PRIORITY } from "@/components/agent-reply/ReplyTargetProvider"
import { cn } from "@/lib/utils"
import type { FieldAttachments } from "../../hooks/useWorkbenchFiles"
import { AttachableTextarea } from "./AttachableTextarea"

const IMPLEMENT_HINT = "Essas informações (e os arquivos anexados) são enviadas ao agente junto do plano aprovado, no prompt de implementação."

const LABEL = "Informações adicionais (opcional)"

interface ImplementInfoFieldProps {
    value: string
    onValueChange: (value: string) => void
    attachments: FieldAttachments
    id?: string
    /** Explicação de para onde as informações vão (padrão: o prompt de implementação). */
    hint?: string
    /**
     * Celular (`< lg`, OPE-166): começa recolhido num botão "Informações adicionais". O campo continua
     * montado (oculto) para a citação de linha da saída cair nele, e abre sozinho quando ganha texto ou anexo.
     */
    collapsible?: boolean
}

/**
 * "Informações adicionais" opcionais (texto e anexos) de uma ação da mesa: ao aprovar o plano vão no
 * prompt de implementação; em "Especificação pronta", no "Gerar plano" (OPE-137).
 */
export function ImplementInfoField({ value, onValueChange, attachments, id = "workbench-implement-info", hint = IMPLEMENT_HINT, collapsible = false }: ImplementInfoFieldProps) {
    const [expanded, setExpanded] = useState(false)
    const open = !collapsible || expanded || value.length > 0 || attachments.items.length > 0
    return (
        <motion.div key="implement-info" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="space-y-1.5 overflow-hidden">
            {collapsible ? (
                <button type="button" className="flex min-h-9 w-full items-center gap-2 text-left text-sm font-medium" aria-expanded={open} aria-controls={`${id}-panel`} onClick={() => setExpanded(!open)}>
                    {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden /> : <Plus className="h-4 w-4 text-muted-foreground" aria-hidden />}
                    {LABEL}
                </button>
            ) : (
                <label htmlFor={id} className="text-sm font-medium">
                    {LABEL}
                </label>
            )}
            <div id={`${id}-panel`} className={cn("space-y-1.5", !open && "hidden")}>
                {collapsible && (
                    <label htmlFor={id} className="sr-only">
                        {LABEL}
                    </label>
                )}
                <AttachableTextarea id={id} rows={3} value={value} onValueChange={onValueChange} replyPriority={REPLY_PRIORITY.extra} placeholder="Ex.: regras de negócio, decisões, links, o que evitar…" attachments={attachments} />
                <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
        </motion.div>
    )
}
