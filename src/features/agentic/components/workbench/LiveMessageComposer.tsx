"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Loader2, MessageSquarePlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { NO_ATTACHMENTS, type FieldAttachments } from "../../hooks/useWorkbenchFiles"
import { AttachableTextarea } from "./AttachableTextarea"

const HINT = "Entra na execução em andamento, sem interromper: o agente considera e segue."

/**
 * Chat durante a execução: campo para enviar uma mensagem (e anexos) ao agente que está trabalhando.
 * A mensagem entra na execução em andamento (sem interromper). Controlado pelo pai, que guarda o texto
 * (citações de linha da saída também o preenchem) e envia. Sem `attachments` (ex.: refinamento), é só texto.
 * `compact` (celular, `< lg`, OPE-166): campo de uma linha que cresce ao focar ou com texto, explicação só
 * para leitores de tela e botão com rótulo curto.
 */
export function LiveMessageComposer({ id, value, onValueChange, onSubmit, pending, attachments = NO_ATTACHMENTS, compact = false }: { id: string; value: string; onValueChange: (value: string) => void; onSubmit: (text: string) => void; pending: boolean; attachments?: FieldAttachments; compact?: boolean }) {
    const [focused, setFocused] = useState(false)
    const text = value.trim()
    const blocked = attachments.blockReason
    const disabled = pending || !text || Boolean(blocked)
    const icon = pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden />
    // Celular: uma linha enquanto ocioso; cresce ao focar ou com texto.
    const collapsed = compact && !focused && !value
    const field = (
        <AttachableTextarea
            id={id}
            rows={collapsed ? 1 : 2}
            className={collapsed ? "min-h-10" : undefined}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            value={value}
            onValueChange={onValueChange}
            placeholder={compact ? "Mensagem ao agente…" : "Envie uma instrução ao agente enquanto ele trabalha…"}
            attachments={attachments}
        />
    )
    return (
        <motion.div key="live-message" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="space-y-1.5 overflow-hidden" data-ctrl-enter-scope>
            <label htmlFor={id} className="sr-only">
                Mensagem para o agente em execução
            </label>
            {compact ? (
                <>
                    <div className="flex items-end gap-2">
                        <div className="min-w-0 flex-1">{field}</div>
                        <Button type="button" data-ctrl-enter-submit className="h-10 shrink-0 gap-1.5" disabled={disabled} title={blocked ?? undefined} aria-label="Enviar ao agente" onClick={() => onSubmit(text)}>
                            {icon} Enviar
                        </Button>
                    </div>
                    <p className="sr-only">{HINT}</p>
                </>
            ) : (
                <>
                    {field}
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">{HINT}</p>
                        <Button type="button" data-ctrl-enter-submit size="sm" className="shrink-0 gap-1.5" disabled={disabled} title={blocked ?? undefined} onClick={() => onSubmit(text)}>
                            {icon}
                            Enviar ao agente
                        </Button>
                    </div>
                </>
            )}
        </motion.div>
    )
}
