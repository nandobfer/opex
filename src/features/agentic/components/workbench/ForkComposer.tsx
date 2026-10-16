"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { GitFork, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useOpenFork } from "../../hooks/useForks"
import type { ForkDto } from "../../types"

/** Primeira mensagem de um fork novo da conversa (obrigatória para abrir); com `parent`, um fork de fork. */
export function ForkComposer({ workbenchId, parent, onCancel, onOpened }: { workbenchId: string; parent?: { id: string; number: number }; onCancel: () => void; onOpened: (fork: ForkDto) => void }) {
    const fieldId = parent ? `fork-child-message-${parent.id}` : "workbench-fork-message"
    const [text, setText] = useState("")
    const open = useOpenFork(workbenchId)
    const pending = open.isPending
    return (
        <motion.div key="fork-composer" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="space-y-2 overflow-hidden">
            <label htmlFor={fieldId} className="text-sm font-medium">
                O que você quer perguntar ou investigar no fork?
            </label>
            <Textarea id={fieldId} autoFocus rows={4} value={text} onChange={(event) => setText(event.target.value)} placeholder="Ex.: por que o plano usa o serviço X? Investigue como o módulo Y trata Z…" />
            <p className="text-xs text-muted-foreground">
                {parent
                    ? `O fork copia a conversa do Fork ${parent.number} até aqui, responde separado (somente leitura) e não interfere nela.`
                    : "O fork copia a conversa até aqui, responde numa aba própria (somente leitura) e não interfere no trabalho principal."}
            </p>
            <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={onCancel} disabled={pending}>
                    <X className="h-3.5 w-3.5" aria-hidden /> Cancelar
                </Button>
                <Button type="button" data-ctrl-enter-submit size="sm" className="gap-1.5" disabled={pending || !text.trim()} onClick={() => open.mutate({ text: text.trim(), parentForkId: parent?.id }, { onSuccess: onOpened })}>
                    {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <GitFork className="h-3.5 w-3.5" aria-hidden />}
                    Abrir fork
                </Button>
            </div>
        </motion.div>
    )
}
