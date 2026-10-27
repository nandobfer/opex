"use client"

import { motion } from "framer-motion"
import { Loader2, MessageSquarePlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ReplyTextarea } from "@/components/agent-reply/ReplyTextarea"

/**
 * Chat durante a execução: campo para enviar uma mensagem ao agente que está trabalhando. A mensagem
 * entra na execução em andamento (sem interromper). Controlado pelo pai, que guarda o texto (citações
 * de linha da saída também o preenchem) e envia.
 */
export function LiveMessageComposer({ id, value, onValueChange, onSubmit, pending }: { id: string; value: string; onValueChange: (value: string) => void; onSubmit: (text: string) => void; pending: boolean }) {
    const text = value.trim()
    return (
        <motion.div key="live-message" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="space-y-1.5 overflow-hidden" data-ctrl-enter-scope>
            <label htmlFor={id} className="sr-only">
                Mensagem para o agente em execução
            </label>
            <ReplyTextarea id={id} rows={2} value={value} onValueChange={onValueChange} placeholder="Envie uma instrução ao agente enquanto ele trabalha…" />
            <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">Entra na execução em andamento, sem interromper: o agente considera e segue.</p>
                <Button type="button" data-ctrl-enter-submit size="sm" className="shrink-0 gap-1.5" disabled={pending || !text} onClick={() => onSubmit(text)}>
                    {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden />}
                    Enviar ao agente
                </Button>
            </div>
        </motion.div>
    )
}
