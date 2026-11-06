"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Ban } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useRoutineChannelAction } from "../../hooks/useRoutineAgents"
import type { RoutineAgentDto } from "../../types"

/**
 * Canais extras do Provisionamento (OPE-143). **Remover** cancela a assinatura do agente no Engramind (o
 * canal e as memórias ficam) e bloqueia o canal neste agente, com confirmação.
 */
export function RoutineExtraChannelsList({ agent, disabled }: { agent: RoutineAgentDto; disabled: boolean }) {
    const state = agent.provisioning
    const action = useRoutineChannelAction()
    const [removing, setRemoving] = useState<string | null>(null)
    return (
        <div className="space-y-1">
            <p className="text-xs font-semibold">Canais extras</p>
            {state.extras.length === 0 ? (
                <p className="text-xs text-muted-foreground">{state.steps.extras ? "O subagente não escolheu canais extras." : "Ainda não avaliados."}</p>
            ) : (
                <ul className="space-y-1.5">
                    <AnimatePresence initial={false}>
                        {state.extras.map((extra) => (
                            <motion.li key={extra.channel} layout="position" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="flex items-start justify-between gap-2 rounded-md border p-2 text-xs">
                                <div className="min-w-0">
                                    <code>{extra.channel}</code> {extra.created && <span className="ml-1 rounded-full bg-primary/10 px-1.5 text-primary">criado</span>}
                                    <p className="text-muted-foreground">{extra.reason}</p>
                                </div>
                                <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 gap-1 px-2 text-destructive hover:text-destructive" disabled={disabled || action.isPending} onClick={() => setRemoving(extra.channel)} aria-label={`Remover o canal ${extra.channel}`}>
                                    <Ban className="h-3.5 w-3.5" aria-hidden /> Remover
                                </Button>
                            </motion.li>
                        ))}
                    </AnimatePresence>
                </ul>
            )}
            <ConfirmDialog
                open={removing !== null}
                onOpenChange={(open) => !open && setRemoving(null)}
                title={`Remover o canal ${removing ?? ""}?`}
                description="A assinatura do agente é cancelada no Engramind (ele deixa de ler e gravar no canal). O canal, as memórias e os outros assinantes continuam intactos. O provisionamento não volta a assinar este canal; você pode assiná-lo de novo em Canais bloqueados."
                confirmLabel="Remover canal"
                variant="destructive"
                pending={action.isPending}
                onConfirm={() => removing && action.mutate({ id: agent.id, action: "block", channel: removing }, { onSettled: () => setRemoving(null) })}
            />
        </div>
    )
}
