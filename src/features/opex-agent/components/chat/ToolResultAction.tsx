"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Eye, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SecretReveal } from "@/components/ui/secret-reveal"
import { apiErrorMessage } from "@/lib/api"
import type { OpexResultAction } from "../../result-actions"
import { useSecretReveal } from "../../hooks/useSecretReveal"

/** Botão de ação no resultado de uma ferramenta (genérico; hoje `reveal-secret`, ex.: "Ver token"). */
export function ToolResultAction({ action }: { action: OpexResultAction }) {
    const reveal = useSecretReveal()
    const [secret, setSecret] = useState<string | null>(null)
    const [gone, setGone] = useState<string | null>(null)
    const expired = Date.parse(action.expiresAt) <= Date.now()
    const shownGone = gone ?? (expired ? "Token já exibido ou vencido: revogue e emita outro." : null)

    const open = async () => {
        try {
            const result = await reveal.mutateAsync(action.id)
            setSecret(result.secret)
        } catch (error) {
            setGone(apiErrorMessage(error, "Token já exibido ou vencido: revogue e emita outro."))
        }
    }

    return (
        <div className="border-t px-2.5 py-2">
            <AnimatePresence mode="wait" initial={false}>
                {shownGone ? (
                    <motion.p key="gone" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="text-[11px] text-muted-foreground">
                        {shownGone}
                    </motion.p>
                ) : (
                    <motion.div key="action" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                        <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5" disabled={reveal.isPending || secret !== null} onClick={() => void open()}>
                            {reveal.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />} {action.label}
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>
            <Dialog
                open={secret !== null}
                onOpenChange={(next) => {
                    if (next) return
                    setSecret(null)
                    setGone("Token já exibido.")
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{action.title}</DialogTitle>
                        <DialogDescription>Este é o único momento em que o segredo aparece. Copie e guarde agora.</DialogDescription>
                    </DialogHeader>
                    {secret && <SecretReveal value={secret} hint="Use no cabeçalho Authorization: Bearer … do sistema que vai consumir o Engramind." />}
                </DialogContent>
            </Dialog>
        </div>
    )
}
