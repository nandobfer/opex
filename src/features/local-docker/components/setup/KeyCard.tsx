"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { FileKey2, KeyRound, ShieldCheck } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { IconAction } from "@/components/ui/icon-action"
import { Textarea } from "@/components/ui/textarea"
import { localDockerKeyActionSchema } from "../../schemas"
import { useLocalDockerKey } from "../../hooks/useLocalDocker"
import type { LocalDockerKeyDto } from "../../types"

const swap = { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 }, transition: { duration: 0.18 } }

/** Mensagem de validação da chave colada (mesmo schema da API), `null` = válida. */
export function importKeyError(value: string): string | null {
    const parsed = localDockerKeyActionSchema.safeParse({ action: "import", privateKey: value })
    return parsed.success ? null : (parsed.error.issues[0]?.message ?? "Chave inválida")
}

/** Chave do servidor: gerar nova ou inserir existente. Depois de definida, a chave nunca aparece. */
export function KeyCard({ keyInfo }: { keyInfo: LocalDockerKeyDto }) {
    const key = useLocalDockerKey()
    const [confirmGenerate, setConfirmGenerate] = useState(false)
    const [importing, setImporting] = useState(false)
    const [privateKey, setPrivateKey] = useState("")
    const error = privateKey ? importKeyError(privateKey) : null
    const replaceWarning = keyInfo.configured ? " A chave atual deixa de valer: rode o script de novo no WSL para autorizar a nova." : ""

    const generate = () => key.mutate({ action: "generate" }, { onSettled: () => setConfirmGenerate(false) })
    const submitImport = () => key.mutate({ action: "import", privateKey }, { onSuccess: () => { setImporting(false); setPrivateKey("") } })

    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <KeyRound className="h-4 w-4" aria-hidden /> Chave do servidor
                    </CardTitle>
                    <CardDescription>O servidor entra no SSH do WSL com esta chave. Ela nunca é exibida: só pode ser substituída.</CardDescription>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                    <IconAction icon={KeyRound} label={keyInfo.configured ? "Gerar uma chave nova (substitui a atual)" : "Gerar a chave do servidor"} busy={key.isPending && key.variables?.action === "generate"} onClick={() => (keyInfo.configured ? setConfirmGenerate(true) : generate())} />
                    <IconAction icon={FileKey2} label={keyInfo.configured ? "Inserir uma chave existente (substitui a atual)" : "Inserir uma chave existente"} busy={key.isPending && key.variables?.action === "import"} onClick={() => setImporting(true)} />
                </div>
            </CardHeader>
            <CardContent>
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={keyInfo.fingerprint ?? String(keyInfo.configured)} {...swap} className="flex items-start gap-2 text-sm">
                        {keyInfo.configured ? (
                            <>
                                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                                <span>
                                    <span className="font-medium">Chave configurada</span> <span className="text-muted-foreground">({keyInfo.source === "imported" ? "inserida" : "gerada no servidor"})</span>
                                    {keyInfo.fingerprint && <span className="block break-all font-mono text-xs text-muted-foreground">{keyInfo.fingerprint}</span>}
                                </span>
                            </>
                        ) : (
                            <span className="text-muted-foreground">Nenhuma chave: gere uma nova ou insira uma chave privada existente (botões acima).</span>
                        )}
                    </motion.div>
                </AnimatePresence>
            </CardContent>

            <AlertDialog open={confirmGenerate} onOpenChange={setConfirmGenerate}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Gerar uma chave nova?</AlertDialogTitle>
                        <AlertDialogDescription>Uma chave nova é criada no servidor.{replaceWarning}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={generate}>Gerar nova</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={importing} onOpenChange={(open) => (setImporting(open), open || setPrivateKey(""))}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Inserir uma chave existente</DialogTitle>
                        <DialogDescription>Cole a chave privada OpenSSH (sem senha). Ela fica cifrada na integração e é gravada no servidor; depois disso não aparece mais.{replaceWarning}</DialogDescription>
                    </DialogHeader>
                    <Textarea rows={8} value={privateKey} onChange={(event) => setPrivateKey(event.target.value)} className="font-mono text-xs" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" aria-label="Chave privada" aria-invalid={Boolean(error) || undefined} spellCheck={false} autoComplete="off" />
                    {error && <p className="text-xs text-destructive">{error}</p>}
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setImporting(false)}>
                            Cancelar
                        </Button>
                        <Button type="button" disabled={!privateKey || Boolean(error) || key.isPending} onClick={submitImport}>
                            Inserir chave
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    )
}
