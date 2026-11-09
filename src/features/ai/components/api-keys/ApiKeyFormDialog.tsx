"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { createAiApiKeySchema, replaceAiApiKeySecretSchema, type AiApiKeyDto, type AiApiKeyProviderId, type CreateAiApiKeyInput } from "../../api-keys"
import { useCreateAiApiKey, useUpdateAiApiKey } from "../../hooks/useAiApiKeys"

/** Substituir: só o segredo é validado (o nome não aparece; o PATCH envia só `secret`). */
const REPLACE_FORM_SCHEMA = replaceAiApiKeySecretSchema.extend({ name: z.string() })

interface ApiKeyFormDialogProps {
    provider: AiApiKeyProviderId
    providerName: string
    /** `null` = nova chave; uma chave = substituir o segredo dela. */
    target: AiApiKeyDto | null
    open: boolean
    onOpenChange: (open: boolean) => void
}

/**
 * Nova chave (nome + segredo) ou "Substituir segredo" (só o segredo, mantendo nome, id e o consumo
 * agrupado). Sem `<form>`: o diálogo é filho do formulário da página no React (eventos atravessam o
 * portal), então o envio é por botão `type="button"`.
 */
export function ApiKeyFormDialog({ provider, providerName, target, open, onOpenChange }: ApiKeyFormDialogProps) {
    const replacing = target !== null
    const create = useCreateAiApiKey(provider)
    const update = useUpdateAiApiKey(provider, "Segredo da chave substituído")
    const pending = create.isPending || update.isPending
    const form = useForm<CreateAiApiKeyInput>({
        resolver: zodResolver(replacing ? REPLACE_FORM_SCHEMA : createAiApiKeySchema),
        mode: "onChange",
        defaultValues: { name: "", secret: "" },
    })
    const { errors } = form.formState

    const submit = form.handleSubmit(async (values) => {
        const done = replacing
            ? await update.mutateAsync({ id: target.id, input: { secret: values.secret } }).then(() => true, () => false)
            : await create.mutateAsync(values).then(() => true, () => false)
        if (done) {
            form.reset()
            onOpenChange(false)
        }
    })

    const onKeyDown = (event: React.KeyboardEvent) => {
        if (event.key !== "Enter") return
        event.preventDefault()
        event.stopPropagation()
        void submit()
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) form.reset()
                onOpenChange(next)
            }}
        >
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{replacing ? `Substituir o segredo de "${target.name}"` : `Nova chave de API — ${providerName}`}</DialogTitle>
                    <DialogDescription>
                        {replacing
                            ? `O nome e o histórico de consumo continuam nesta chave.${target.active ? " Ela está em uso: o provedor passa a usar o novo segredo na hora." : ""}`
                            : "O segredo é cifrado no servidor e nunca é exibido de novo. A primeira chave do provedor já entra em uso."}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4" onKeyDown={onKeyDown}>
                    {!replacing && (
                        <Field id="ai-api-key-name" label="Nome *" error={errors.name?.message}>
                            <Input id="ai-api-key-name" placeholder="Ex.: Conta pessoal" autoFocus {...form.register("name")} />
                        </Field>
                    )}
                    <Field id="ai-api-key-secret" label={replacing ? "Novo segredo *" : "Chave de API *"} error={errors.secret?.message}>
                        <Input id="ai-api-key-secret" type="password" autoComplete="off" spellCheck={false} autoFocus={replacing} {...form.register("secret")} />
                    </Field>
                </div>
                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
                        Cancelar
                    </Button>
                    <Button type="button" className="gap-1.5" disabled={pending || !form.formState.isValid} onClick={() => void submit()}>
                        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                        {replacing ? "Substituir" : "Adicionar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
