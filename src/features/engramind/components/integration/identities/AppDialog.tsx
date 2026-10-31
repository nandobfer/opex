"use client"

import { useCallback } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { createAppInput, updateAppInput } from "../../../operations"
import { IDENTITY_HELP } from "../../../help/identities"
import type { EngramindApp } from "../../../types"
import { engramindSend, route, useEngramindMutation } from "../../../hooks/useEngramind"
import { InfoField } from "../../shared/InfoField"
import { emptyTo, useSchemaForm } from "../../shared/useSchemaForm"

interface AppDialogProps {
    app: EngramindApp | null
    open: boolean
    onOpenChange: (open: boolean) => void
}

type Values = { slug: string; name: string; description: string; webhookUrl: string; webhookSecret: string }

/** Criar ou editar um app (nome, descrição e webhook; o segredo só é gravado). */
export function AppDialog({ app, open, onOpenChange }: AppDialogProps) {
    const editing = app !== null
    const toPayload = useCallback(
        (values: Values) =>
            editing
                ? { app: app.slug, name: values.name.trim(), description: emptyTo(values.description, null), webhook_url: emptyTo(values.webhookUrl, null), ...(values.webhookSecret ? { webhook_secret: values.webhookSecret } : {}) }
                : { slug: values.slug.trim(), name: values.name.trim(), description: emptyTo(values.description, undefined), webhook_url: emptyTo(values.webhookUrl, undefined), webhook_secret: values.webhookSecret || undefined },
        [app, editing],
    )
    const form = useSchemaForm<Values, unknown>(editing ? updateAppInput : createAppInput, { slug: app?.slug ?? "", name: app?.name ?? "", description: app?.description ?? "", webhookUrl: app?.webhook?.url ?? "", webhookSecret: "" }, toPayload)
    const save = useEngramindMutation((payload: Record<string, unknown>) => (editing ? engramindSend("patch", route("apps", app.slug), payload) : engramindSend("post", "apps", payload)), {
        invalidate: ["apps"],
        success: editing ? "App atualizado" : "App criado",
    })
    const submit = () => form.payload && save.mutate(form.payload as Record<string, unknown>, { onSuccess: () => onOpenChange(false) })
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>{editing ? `Editar app ${app.slug}` : "Novo app"}</DialogTitle>
                    <DialogDescription>{IDENTITY_HELP.app}</DialogDescription>
                </DialogHeader>
                <div className={FORM_GRID}>
                    <InfoField id="app-slug" label="Slug" info="Único na rede; minúsculas, dígitos e hífens. Não muda depois." error={form.error("slug")}>
                        <Input id="app-slug" value={form.values.slug} onChange={(event) => form.set("slug", event.target.value)} disabled={editing} placeholder="app-a" />
                    </InfoField>
                    <InfoField id="app-name" label="Nome" error={form.error("name")}>
                        <Input id="app-name" value={form.values.name} onChange={(event) => form.set("name", event.target.value)} placeholder="App A" />
                    </InfoField>
                    <InfoField id="app-description" label="Descrição" error={form.error("description")}>
                        <Textarea id="app-description" rows={2} value={form.values.description} onChange={(event) => form.set("description", event.target.value)} />
                    </InfoField>
                    <InfoField id="app-webhook" label="URL do webhook" info={IDENTITY_HELP.webhook} error={form.error("webhook_url")} hint={editing ? "Vazia remove o webhook." : undefined}>
                        <Input id="app-webhook" value={form.values.webhookUrl} onChange={(event) => form.set("webhookUrl", event.target.value)} placeholder="https://gestor.interno/engramind/events" />
                    </InfoField>
                    <InfoField id="app-secret" label="Segredo do webhook" info="De 32 a 256 caracteres; cifrado no Engramind e nunca exibido." error={form.error("webhook_secret")} hint={editing ? (app.webhook?.secret.configured ? "Configurado: vazio mantém o atual." : "Não configurado.") : undefined}>
                        <Input id="app-secret" type="password" autoComplete="new-password" value={form.values.webhookSecret} onChange={(event) => form.set("webhookSecret", event.target.value)} />
                    </InfoField>
                </div>
                <DialogFooter>
                    <Button type="button" onClick={submit} disabled={!form.valid || save.isPending}>
                        {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} {editing ? "Salvar" : "Criar app"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
