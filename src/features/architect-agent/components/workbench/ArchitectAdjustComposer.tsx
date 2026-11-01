"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { MessageSquarePlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FeedbackComposer, type FeedbackCopy } from "@/features/agentic/components/workbench/FeedbackComposer"
import type { ArchitectDepth } from "../../constants"
import { DepthControl } from "./DepthControl"

const COPY: FeedbackCopy = {
    title: "Pedir ajustes no diagrama",
    placeholder: 'Ex.: "expanda o fluxo de autenticação", "junte as camadas de dados".',
    submit: "Gerar nova versão",
}

/**
 * Rodapé da aba Arquitetura (mesmo padrão do feedback do plano): "Pedir ajustes" abre o campo com o
 * slider de profundidade ao lado; cada envio gera uma versão nova a partir do grafo exibido.
 */
export function ArchitectAdjustComposer({ defaultDepth, pending, disabled, onSubmit }: { defaultDepth: ArchitectDepth; pending: boolean; disabled: boolean; onSubmit: (input: { feedback: string; depth: ArchitectDepth }) => Promise<boolean> }) {
    const [open, setOpen] = useState(false)
    const [text, setText] = useState("")
    const [depth, setDepth] = useState(defaultDepth)
    return (
        <div className="border-t px-4 py-3">
            <AnimatePresence mode="wait" initial={false}>
                {open ? (
                    <FeedbackComposer
                        key="composer"
                        id="architect-adjust"
                        copy={COPY}
                        value={text}
                        onValueChange={setText}
                        pending={pending}
                        onCancel={() => setOpen(false)}
                        onSubmit={async (feedback) => {
                            if (await onSubmit({ feedback, depth })) {
                                setText("")
                                setOpen(false)
                            }
                        }}
                        aside={<DepthControl id="architect-adjust-depth" value={depth} onChange={setDepth} disabled={pending} compact />}
                    />
                ) : (
                    <motion.div key="button" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex justify-end">
                        <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={disabled} onClick={() => setOpen(true)}>
                            <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden /> Pedir ajustes
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
