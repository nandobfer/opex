"use client"

import { useCallback } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createAgentInput, updateAgentInput } from "../../../operations"
import { IDENTITY_HELP } from "../../../help/identities"
import type { EngramindAgent, EngramindApp } from "../../../types"
import { engramindSend, route, useEngramindMutation } from "../../../hooks/useEngramind"
import { InfoField } from "../../shared/InfoField"
import { emptyTo, useSchemaForm } from "../../shared/useSchemaForm"

interface AgentDialogProps {
    agent: EngramindAgent | null
    apps: EngramindApp[]
    open: boolean
    onOpenChange: (open: boolean) => void
}

type Values = { app: string; slug: string; name: string; description: string }

/** Criar ou editar um agente (o endereço completo é app/agente). */
export function AgentDialog({ agent, apps, open, onOpenChange }: AgentDialogProps) {
    const editing = agent !== null
    const toPayload = useCallback(
        (values: Values) =>
            editing ? { agent: agent.qualified_slug, name: values.name.trim(), description: emptyTo(values.description, null) } : { app: values.app, slug: values.slug.trim(), name: values.name.trim(), description: emptyTo(values.description, undefined) },
        [agent, editing],
    )
    const form = useSchemaForm<Values, unknown>(editing ? updateAgentInput : createAgentInput, { app: agent?.app.slug ?? apps[0]?.slug ?? "", slug: agent?.slug ?? "", name: agent?.name ?? "", description: agent?.description ?? "" }, toPayload)
    const save = useEngramindMutation((payload: Record<string, unknown>) => (editing ? engramindSend("patch", route("agents", agent.qualified_slug), payload) : engramindSend("post", "agents", payload)), {
        invalidate: ["agents"],
        success: editing ? "Agente atualizado" : "Agente criado",
    })
    const submit = () => form.payload && save.mutate(form.payload as Record<string, unknown>, { onSuccess: () => onOpenChange(false) })
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>{editing ? `Editar agente ${agent.qualified_slug}` : "Novo agente"}</DialogTitle>
                    <DialogDescription>{IDENTITY_HELP.agent}</DialogDescription>
                </DialogHeader>
                <div className={FORM_GRID}>
                    <InfoField id="agent-app" label="App" info="App dono do agente." error={form.error("app")}>
                        <Select value={form.values.app} onValueChange={(value) => form.set("app", value)} disabled={editing}>
                            <SelectTrigger id="agent-app" className="bg-transparent">
                                <SelectValue placeholder="Escolha o app" />
                            </SelectTrigger>
                            <SelectContent>
                                {apps.map((app) => (
                                    <SelectItem key={app.id} value={app.slug}>
                                        {app.name} ({app.slug})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </InfoField>
                    <InfoField id="agent-slug" label="Slug" info="Único dentro do app; minúsculas, dígitos e hífens. Não muda depois." error={form.error("slug")}>
                        <Input id="agent-slug" value={form.values.slug} onChange={(event) => form.set("slug", event.target.value)} disabled={editing} placeholder="curador" />
                    </InfoField>
                    <InfoField id="agent-name" label="Nome" error={form.error("name")}>
                        <Input id="agent-name" value={form.values.name} onChange={(event) => form.set("name", event.target.value)} />
                    </InfoField>
                    <InfoField id="agent-description" label="Descrição" error={form.error("description")}>
                        <Textarea id="agent-description" rows={2} value={form.values.description} onChange={(event) => form.set("description", event.target.value)} />
                    </InfoField>
                </div>
                <DialogFooter>
                    <Button type="button" onClick={submit} disabled={!form.valid || save.isPending}>
                        {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} {editing ? "Salvar" : "Criar agente"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
