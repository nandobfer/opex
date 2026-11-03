"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SecretReveal } from "@/components/ui/secret-reveal"
import type { EngramindToken, IssuedToken } from "../../../types"
import { engramindSend, route, useEngramindMutation } from "../../../hooks/useEngramind"

type Rotated = IssuedToken & { own?: "admin" | "app" | null; savedOwn?: boolean }

/**
 * Rotacionar (OPE-117): o Engramind emite o token igual e revoga o antigo num passo. O consumidor precisa
 * receber o novo segredo (mostrado UMA vez, com Copiar); nos tokens do próprio Opex ele já é gravado.
 */
export function RotateTokenDialog({ token, own, open, onOpenChange }: { token: EngramindToken; own: boolean; open: boolean; onOpenChange: (open: boolean) => void }) {
    const [result, setResult] = useState<Rotated | null>(null)
    const rotate = useEngramindMutation(() => engramindSend<Rotated>("post", route("tokens", token.id, "rotate"), {}), { invalidate: ["tokens", "connection"], success: "Token rotacionado" })
    const done = result !== null
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>{done ? "Token rotacionado" : `Rotacionar o token ${token.prefix}?`}</DialogTitle>
                    <DialogDescription>
                        {done
                            ? result.savedOwn
                                ? "O novo segredo já foi gravado no Opex; o antigo deixou de autenticar."
                                : "Este é o único momento em que o novo segredo aparece. Copie e entregue ao consumidor agora."
                            : own
                              ? "É um token do próprio Opex: o novo segredo é gravado sozinho na integração e o antigo deixa de autenticar na hora."
                              : "Um token igual (mesmo app, agente, escopos, rótulo e validade) é emitido e o antigo é revogado na hora: o consumidor precisa receber o novo segredo."}
                    </DialogDescription>
                </DialogHeader>
                <AnimatePresence mode="wait" initial={false}>
                    {done && (
                        <motion.div key="done" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="space-y-2" data-testid="rotate-result">
                            {result.secret ? (
                                <>
                                    {result.own && <p className="text-xs text-warning">O Opex não conseguiu gravar o novo segredo: cole-o na aba Conexão ({result.own === "admin" ? "Token admin" : "Token do app opex"}).</p>}
                                    <SecretReveal value={result.secret} hint="Use no cabeçalho Authorization: Bearer … do sistema que consome o Engramind." />
                                </>
                            ) : (
                                <p className="flex items-center gap-1.5 text-sm text-success">
                                    <CheckCircle2 className="h-4 w-4" aria-hidden /> Novo token {result.token.prefix} em uso.
                                </p>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
                <DialogFooter>
                    {done ? (
                        <Button type="button" onClick={() => onOpenChange(false)}>
                            {result.secret ? "Já copiei" : "Fechar"}
                        </Button>
                    ) : (
                        <>
                            <Button type="button" variant="outline" className="bg-transparent" onClick={() => onOpenChange(false)} disabled={rotate.isPending}>
                                Cancelar
                            </Button>
                            <Button type="button" onClick={() => rotate.mutate(undefined as never, { onSuccess: (response) => setResult(response) })} disabled={rotate.isPending}>
                                {rotate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Rotacionar
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
