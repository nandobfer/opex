"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { GitFork, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ReplyTextarea } from "@/components/agent-reply/ReplyTextarea"
import { useOpenFork } from "../../hooks/useForks"
import type { ForkDto } from "../../types"

/**
 * Primeira mensagem de um fork novo da conversa (obrigatória para abrir); com `parent`, um fork de fork.
 * A caixa **Somente leitura** trava o fork em Plan (sem volta); fork de fork não herda a trava do pai.
 */
export function ForkComposer({ workbenchId, parent, onCancel, onOpened }: { workbenchId: string; parent?: { id: string; number: number }; onCancel: () => void; onOpened: (fork: ForkDto) => void }) {
    const fieldId = parent ? `fork-child-message-${parent.id}` : "workbench-fork-message"
    const [text, setText] = useState("")
    const [readOnly, setReadOnly] = useState(false)
    const open = useOpenFork(workbenchId)
    const pending = open.isPending
    return (
        <motion.div key="fork-composer" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="space-y-2 overflow-hidden">
            <label htmlFor={fieldId} className="text-sm font-medium">
                O que você quer perguntar ou investigar no fork?
            </label>
            <ReplyTextarea id={fieldId} autoFocus rows={4} value={text} onValueChange={setText} placeholder="Ex.: por que o plano usa o serviço X? Investigue como o módulo Y trata Z…" />
            <p className="text-xs text-muted-foreground">
                {parent
                    ? `O fork copia a conversa do Fork ${parent.number} até aqui e responde separado, sem mudar a conversa dele.`
                    : "O fork copia a conversa até aqui e responde numa aba própria, sem mudar a conversa principal."}{" "}
                Abre no modo do agente Fork (plan = somente leitura) e, durante a conversa, alterna entre Plan e Build (pode alterar arquivos).
            </p>
            <label htmlFor={`${fieldId}-read-only`} className="flex cursor-pointer items-start gap-2 text-sm">
                <Checkbox id={`${fieldId}-read-only`} checked={readOnly} onCheckedChange={(checked) => setReadOnly(checked === true)} disabled={pending} className="mt-0.5" />
                <span>
                    Somente leitura
                    <span className="block text-xs text-muted-foreground">Trava o fork em Plan: não será possível trocar para Build.</span>
                </span>
            </label>
            <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={onCancel} disabled={pending}>
                    <X className="h-3.5 w-3.5" aria-hidden /> Cancelar
                </Button>
                <Button type="button" data-ctrl-enter-submit size="sm" className="gap-1.5" disabled={pending || !text.trim()} onClick={() => open.mutate({ text: text.trim(), parentForkId: parent?.id, readOnly }, { onSuccess: onOpened })}>
                    {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <GitFork className="h-3.5 w-3.5" aria-hidden />}
                    Abrir fork
                </Button>
            </div>
        </motion.div>
    )
}
