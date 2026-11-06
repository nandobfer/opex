"use client"

import { useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { routineSecretCreateSchema, routineSecretUpdateSchema, type RoutineSecretUpdateInput } from "../../../schemas"
import type { RoutineSecretDto } from "../../../types"
import { useSaveRoutineSecret } from "../../../hooks/useRoutineSecrets"

const EMPTY: RoutineSecretUpdateInput = { name: "", description: "", allowedHosts: [], value: "" }

const hostsToText = (hosts: string[]) => hosts.join(", ")
const textToHosts = (text: string) =>
    text
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter(Boolean)

/** Domínios separados por vírgula ou espaço (o texto fica livre enquanto digita). */
function HostsInput({ value, onChange }: { value: string[]; onChange: (hosts: string[]) => void }) {
    // O formulário remonta a cada abertura (key), então o texto inicial basta.
    const [text, setText] = useState(() => hostsToText(value))
    return (
        <Input
            id="routine-secret-hosts"
            placeholder="api.linkedin.com, *.gupy.io (vazio: qualquer domínio)"
            value={text}
            onChange={(event) => {
                setText(event.target.value)
                onChange(textToHosts(event.target.value))
            }}
        />
    )
}

/**
 * Criar/editar um segredo (react-hook-form + o MESMO schema Zod da API). O valor só vai: na edição o
 * campo vem vazio e, vazio, mantém o atual. Mostrar/ocultar vale só para o que está sendo digitado.
 */
export function RoutineSecretDialog({ agentId, secret, open, onClose }: { agentId: string; secret: RoutineSecretDto | null; open: boolean; onClose: () => void }) {
    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{secret ? `Editar ${secret.name}` : "Novo segredo"}</DialogTitle>
                    <DialogDescription>O agente usa o segredo nas Chamadas HTTP com {"{{secret:NOME}}"} e nunca vê o valor.</DialogDescription>
                </DialogHeader>
                {open && <SecretForm key={secret?.id ?? "novo"} agentId={agentId} secret={secret} onClose={onClose} />}
            </DialogContent>
        </Dialog>
    )
}

function SecretForm({ agentId, secret, onClose }: { agentId: string; secret: RoutineSecretDto | null; onClose: () => void }) {
    const editing = Boolean(secret)
    const save = useSaveRoutineSecret(agentId)
    const [reveal, setReveal] = useState(false)
    const form = useForm<RoutineSecretUpdateInput>({
        resolver: zodResolver(editing ? routineSecretUpdateSchema : routineSecretCreateSchema),
        mode: "onChange",
        defaultValues: secret ? { name: secret.name, description: secret.description, allowedHosts: secret.allowedHosts, value: "" } : EMPTY,
    })
    const errors = form.formState.errors
    const submit = form.handleSubmit((values) => save.mutate({ id: secret?.id ?? null, input: values }, { onSuccess: onClose }))
    return (
        <form onSubmit={submit} className="space-y-4" aria-label={editing ? "Editar segredo" : "Novo segredo"}>
            <Field id="routine-secret-name" label="Nome" error={errors.name?.message}>
                <Input id="routine-secret-name" placeholder="LINKEDIN_TOKEN" autoComplete="off" {...form.register("name", { setValueAs: (value: string) => value.toUpperCase() })} />
            </Field>
            <Field id="routine-secret-description" label="Descrição (o agente lê)" error={errors.description?.message}>
                <Input id="routine-secret-description" placeholder="Ex.: token da API do LinkedIn (Bearer)" {...form.register("description")} />
            </Field>
            <Field id="routine-secret-value" label={editing ? "Valor novo" : "Valor"} error={errors.value?.message}>
                <div className="flex gap-2">
                    <Input id="routine-secret-value" type={reveal ? "text" : "password"} autoComplete="new-password" placeholder={editing ? "Deixe vazio para manter o valor atual" : "Valor do segredo"} {...form.register("value")} />
                    <Button type="button" variant="outline" size="icon" aria-label={reveal ? "Ocultar o valor digitado" : "Mostrar o valor digitado"} onClick={() => setReveal((current) => !current)}>
                        {reveal ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                    </Button>
                </div>
            </Field>
            <Field id="routine-secret-hosts" label="Domínios permitidos (opcional)" error={errors.allowedHosts?.message ?? errors.allowedHosts?.find?.((item) => item?.message)?.message}>
                <Controller
                    control={form.control}
                    name="allowedHosts"
                    render={({ field }) => <HostsInput value={field.value} onChange={field.onChange} />}
                />
            </Field>
            <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose}>
                    Cancelar
                </Button>
                <Button type="submit" className="gap-1.5" disabled={save.isPending}>
                    {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {editing ? "Salvar" : "Criar segredo"}
                </Button>
            </DialogFooter>
        </form>
    )
}
