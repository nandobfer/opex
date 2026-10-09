"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AnimatePresence, motion } from "framer-motion"
import { Check, Copy, Loader2, ShieldAlert } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { apiTokenInputSchema, type ApiTokenInput } from "../../api-tokens/schemas"
import { useCreateApiToken } from "../../hooks/useApiTokens"

const fade = { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: 0.18 } }

interface ApiTokenDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

/** Gerar um token de sistema (nome); o valor aparece UMA vez. */
export function ApiTokenDialog({ open, onOpenChange }: ApiTokenDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">{open && <ApiTokenContent onClose={() => onOpenChange(false)} />}</DialogContent>
        </Dialog>
    )
}

function ApiTokenContent({ onClose }: { onClose: () => void }) {
    const create = useCreateApiToken()
    const [generated, setGenerated] = useState<string | null>(null)
    const form = useForm<ApiTokenInput>({ resolver: zodResolver(apiTokenInputSchema), defaultValues: { nome: "" }, mode: "onChange" })
    const errors = form.formState.errors

    const submit = form.handleSubmit(async (input) => {
        const result = await create.mutateAsync(input).catch(() => null)
        if (result) setGenerated(result.token)
    })

    return (
        <AnimatePresence mode="wait" initial={false}>
            {generated ? (
                <motion.div key="token" {...fade} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>Token de sistema gerado</DialogTitle>
                        <DialogDescription>Copie agora e guarde num lugar seguro: ele não aparece de novo. Se perder, revogue e gere outro.</DialogDescription>
                    </DialogHeader>
                    <TokenReveal token={generated} />
                    <DialogFooter>
                        <Button type="button" onClick={onClose}>
                            Concluir
                        </Button>
                    </DialogFooter>
                </motion.div>
            ) : (
                <motion.form
                    key="form"
                    {...fade}
                    // A página da integração já é um <form>: o envio daqui não pode chegar até ela (o React propaga pelo portal).
                    onSubmit={(event) => {
                        event.stopPropagation()
                        void submit(event)
                    }}
                    className="space-y-4"
                >
                    <DialogHeader>
                        <DialogTitle>Gerar token de sistema</DialogTitle>
                        <DialogDescription>Dê um nome que identifique quem vai usar o token.</DialogDescription>
                    </DialogHeader>
                    <Field id="api-token-nome" label="Nome (quem vai usar)" error={errors.nome?.message}>
                        <Input id="api-token-nome" autoComplete="off" placeholder="Script de relatórios" {...form.register("nome")} />
                    </Field>
                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={create.isPending}>
                            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                            Gerar token
                        </Button>
                    </DialogFooter>
                </motion.form>
            )}
        </AnimatePresence>
    )
}

/** O valor do token, que aparece UMA vez: copiar e o aviso de uso. */
function TokenReveal({ token }: { token: string }) {
    const [copied, setCopied] = useState(false)
    const copy = async () => {
        await navigator.clipboard.writeText(token)
        setCopied(true)
        toast.success("Token copiado.")
    }
    return (
        <>
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2">
                <code className="min-w-0 flex-1 break-all font-mono text-xs">{token}</code>
                <Button type="button" size="sm" variant="outline" onClick={() => void copy()} aria-label="Copiar token">
                    {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                </Button>
            </div>
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
                <span>
                    Use no cabeçalho <code className="font-mono">Authorization: Bearer …</code>. Entregue só a quem vai usá-lo.
                </span>
            </p>
        </>
    )
}
