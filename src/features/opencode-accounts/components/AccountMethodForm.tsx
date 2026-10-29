"use client"

import { useMemo, type KeyboardEvent } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { addAccountFormSchema, type AddAccountFormValues } from "../form-schema"
import { useConnectOpencodeKey, useStartOpencodeCommand, useStartOpencodeOauth } from "../hooks/useOpencodeAccounts"
import { cleanFormAnswer, defaultFormAnswer, visibleFormFields } from "../logic"
import type { OpencodeAuthMethodDto } from "../types"
import type { StartedLogin } from "./AddAccountDialog"
import { MethodFormFields } from "./MethodFormFields"

interface AccountMethodFormProps {
    integrationId: string
    method: OpencodeAuthMethodDto
    onBack?: () => void
    onConnected: () => void
    onLoginStarted: (login: StartedLogin) => void
}

/** Dados da conta nova: nome, chave (mascarada) e os campos que o OpenCode pede para o método. */
export function AccountMethodForm({ integrationId, method, onBack, onConnected, onLoginStarted }: AccountMethodFormProps) {
    const fields = useMemo(() => (method.kind === "command" ? [] : method.fields), [method])
    const form = useForm<AddAccountFormValues>({ resolver: zodResolver(addAccountFormSchema(method)), mode: "onChange", defaultValues: { label: "", key: "", answer: defaultFormAnswer(fields) } })
    const answer = useWatch({ control: form.control, name: "answer" }) ?? {}
    const shown = visibleFormFields(fields, answer)
    const connectKey = useConnectOpencodeKey()
    const startOauth = useStartOpencodeOauth()
    const startCommand = useStartOpencodeCommand()
    const pending = connectKey.isPending || startOauth.isPending || startCommand.isPending
    const errors = form.formState.errors

    // Sem <form>: o diálogo fica dentro do formulário da página (o submit subiria pelo portal).
    const submit = form.handleSubmit(async (values) => {
        const label = values.label?.trim() || undefined
        const cleaned = cleanFormAnswer(fields, values.answer)
        if (method.kind === "key") {
            const done = await connectKey.mutateAsync({ integrationId, input: { key: values.key ?? "", label, answer: cleaned } }).then(() => true, () => false)
            if (done) onConnected()
            return
        }
        if (method.kind === "oauth") {
            const attempt = await startOauth.mutateAsync({ integrationId, input: { methodId: method.id, label, answer: cleaned } }).catch(() => null)
            if (attempt) onLoginStarted({ kind: "oauth", attempt })
            return
        }
        const attempt = await startCommand.mutateAsync({ integrationId, input: { methodId: method.id, label } }).catch(() => null)
        if (attempt) onLoginStarted({ kind: "command", attemptId: attempt.attemptId })
    })

    // Enter num campo de texto conclui; em botões, seletores e caixas de marcação mantém o padrão.
    const onEnter = (event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== "Enter" || !(event.target instanceof HTMLInputElement) || event.target.type === "checkbox") return
        event.preventDefault()
        event.stopPropagation()
        void submit()
    }

    return (
        <div className="space-y-4" onKeyDown={onEnter}>
            <p className="text-sm font-medium">{method.label}</p>
            {method.kind === "command" && (
                <p className="text-xs text-muted-foreground">
                    O OpenCode roda <code className="font-mono">{method.command.join(" ")}</code> na máquina dele e acompanha o resultado. Se o comando pedir interação no terminal, conecte pelo TUI.
                </p>
            )}
            <div className={FORM_GRID}>
                <Field id="opencode-account-label" label="Nome da conta (opcional)" error={errors.label?.message}>
                    <Input id="opencode-account-label" placeholder="Ex.: Conta pessoal" autoFocus={method.kind !== "key"} {...form.register("label")} />
                </Field>
                {method.kind === "key" && (
                    <Field id="opencode-account-key" label="Chave de API *" error={errors.key?.message}>
                        <Input id="opencode-account-key" type="password" autoComplete="off" autoFocus spellCheck={false} {...form.register("key")} />
                    </Field>
                )}
                <MethodFormFields fields={shown} control={form.control} errors={errors} />
            </div>
            <DialogFooter>
                {onBack && (
                    <Button type="button" variant="ghost" onClick={onBack} disabled={pending}>
                        Voltar
                    </Button>
                )}
                <Button type="button" className="gap-1.5" disabled={pending || !form.formState.isValid} onClick={() => void submit()}>
                    {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                    {method.kind === "key" ? "Adicionar conta" : "Continuar"}
                </Button>
            </DialogFooter>
        </div>
    )
}
