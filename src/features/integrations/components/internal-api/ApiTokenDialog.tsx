"use client"

import { useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AnimatePresence, motion } from "framer-motion"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ErrorState } from "@/components/feedback/ErrorState"
import { Skeleton } from "@/components/ui/skeleton"
import { apiErrorMessage } from "@/lib/api"
import { apiTokenInputSchema, type ApiTokenInput } from "../../api-tokens/schemas"
import type { ApiTokenDto, ApiTokenScopeCatalogDto } from "../../api-tokens/types"
import { useApiTokenScopes, useCreateApiToken, useUpdateApiToken } from "../../hooks/useApiTokens"
import { ApiTokenFormFields } from "./ApiTokenFormFields"
import { ApiTokenReveal } from "./ApiTokenReveal"
import { ApiTokenSummary } from "./ApiTokenSummary"

const fade = { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: 0.18 } }

interface ApiTokenDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Token a editar (escopos e expiração); ausente = gerar um novo. */
    token?: ApiTokenDto | null
}

/** Gerar um token (nome, escopos, expiração; o valor aparece UMA vez) ou editar os escopos de um existente. */
export function ApiTokenDialog({ open, onOpenChange, token = null }: ApiTokenDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">{open && <ApiTokenDialogBody token={token} onClose={() => onOpenChange(false)} />}</DialogContent>
        </Dialog>
    )
}

function ApiTokenDialogBody({ token, onClose }: { token: ApiTokenDto | null; onClose: () => void }) {
    const scopes = useApiTokenScopes()
    const title = token ? `Escopos do token “${token.nome}”` : "Gerar token de sistema"
    if (scopes.isLoading)
        return (
            <div className="space-y-3" data-testid="api-token-dialog-loading">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>Carregando os escopos disponíveis…</DialogDescription>
                </DialogHeader>
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-32 w-full" />
            </div>
        )
    if (scopes.isError || !scopes.data)
        return (
            <div className="space-y-3">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>Os escopos são carregados do servidor.</DialogDescription>
                </DialogHeader>
                <ErrorState title="Não foi possível carregar os escopos" description={apiErrorMessage(scopes.error, "Tente novamente.")} onRetry={() => void scopes.refetch()} />
            </div>
        )
    return <ApiTokenWizard catalog={scopes.data} token={token} title={title} onClose={onClose} />
}

type Step = "form" | "summary" | "token"

function ApiTokenWizard({ catalog, token, title, onClose }: { catalog: ApiTokenScopeCatalogDto; token: ApiTokenDto | null; title: string; onClose: () => void }) {
    const create = useCreateApiToken()
    const update = useUpdateApiToken()
    const [step, setStep] = useState<Step>("form")
    const [generated, setGenerated] = useState<string | null>(null)
    const form = useForm<ApiTokenInput>({
        resolver: zodResolver(apiTokenInputSchema),
        defaultValues: { nome: token?.nome ?? "", escopos: token?.escopos ?? [], expiraEm: token?.expiraEm ?? null },
        mode: "onChange",
    })
    const values = useWatch({ control: form.control }) as Partial<ApiTokenInput>
    const pending = create.isPending || update.isPending

    const toSummary = form.handleSubmit(() => setStep("summary"))
    const confirm = async () => {
        const input = form.getValues()
        if (token) {
            const ok = await update.mutateAsync({ id: token.id, input: { escopos: input.escopos, expiraEm: input.expiraEm ?? null } }).then(() => true, () => false)
            if (ok) onClose()
            return
        }
        const result = await create.mutateAsync(input).catch(() => null)
        if (!result) return
        setGenerated(result.token)
        setStep("token")
    }

    return (
        <AnimatePresence mode="wait" initial={false}>
            {step === "token" && generated ? (
                <motion.div key="token" {...fade} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>Token de sistema gerado</DialogTitle>
                        <DialogDescription>Copie agora e guarde num lugar seguro: ele não aparece de novo. Se perder, revogue e gere outro.</DialogDescription>
                    </DialogHeader>
                    <ApiTokenReveal token={generated} />
                    <DialogFooter>
                        <Button type="button" onClick={onClose}>
                            Concluir
                        </Button>
                    </DialogFooter>
                </motion.div>
            ) : step === "summary" ? (
                <motion.div key="summary" {...fade} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>Confira antes de {token ? "salvar" : "gerar"}</DialogTitle>
                        <DialogDescription>{token ? "A mudança vale na próxima chamada do token; o valor não muda." : "Depois de gerar, o valor aparece uma única vez."}</DialogDescription>
                    </DialogHeader>
                    <ApiTokenSummary nome={values.nome ?? ""} scopes={values.escopos ?? []} expiraEm={values.expiraEm} catalog={catalog} />
                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={() => setStep("form")} disabled={pending}>
                            Voltar
                        </Button>
                        <Button type="button" onClick={() => void confirm()} disabled={pending}>
                            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                            {token ? "Salvar escopos" : "Gerar token"}
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
                        void toSummary(event)
                    }}
                    className="space-y-4"
                >
                    <DialogHeader>
                        <DialogTitle>{title}</DialogTitle>
                        <DialogDescription>{token ? "Troque os escopos e a expiração. O valor do token não muda." : "Dê um nome que identifique quem vai usar o token e escolha o que ele pode acessar."}</DialogDescription>
                    </DialogHeader>
                    <ApiTokenFormFields form={form} catalog={catalog} editing={Boolean(token)} />
                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="submit">Revisar</Button>
                    </DialogFooter>
                </motion.form>
            )}
        </AnimatePresence>
    )
}
