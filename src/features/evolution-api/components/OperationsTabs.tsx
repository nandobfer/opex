"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { useEvolution, useEvolutionAction } from "../hooks/useEvolution"
import { EVOLUTION_WEBHOOK_EVENT_LABELS, type EvolutionWebhookEvent } from "../constants"
import { checkNumberSchema, sendTestSchema, webhookUrlSchema, type ContactKind } from "../schemas"
import type { EvolutionContactDto, EvolutionNumberCheckDto, EvolutionWebhookDto } from "../types"
import { ConversationPicker } from "./ConversationPicker"

export function WebhookTab() {
    const path = "/evolution/webhook-config"
    const query = useEvolution<EvolutionWebhookDto>(path, true, 15000)
    const save = useEvolutionAction(path, "put", "URL gravada")
    const register = useEvolutionAction(path, "post", "Webhook registrado")
    const data = query.data
    const form = useForm({ resolver: zodResolver(webhookUrlSchema), values: { url: data?.url ?? data?.defaultUrl ?? "" }, resetOptions: { keepDirtyValues: true } })
    if (query.isPending) return <Skeleton className="h-64" />
    if (!data) return <Button variant="outline" onClick={() => void query.refetch()}>Tentar novamente</Button>
    return <Card><CardHeader><CardTitle>Webhook da Evolution</CardTitle></CardHeader><CardContent className="space-y-4">
        <form className="space-y-3" onSubmit={form.handleSubmit((input) => save.mutate(input, { onSuccess: () => form.reset(input) }))}>
            <Field label="URL de entrada" id="evolution-webhook-url" error={form.formState.errors.url?.message}><Input id="evolution-webhook-url" {...form.register("url")} /></Field>
            <Button type="submit" disabled={!form.formState.isDirty || save.isPending}>Salvar URL</Button>
        </form>
        <p>{data.secretConfigured ? "Segredo do webhook configurado" : "O segredo será gerado ao registrar."}</p>
        <p>{data.matches ? "Registrado na instância" : "Registro pendente"}</p>
        <ul className="list-inside list-disc text-sm text-muted-foreground">{data.events.map((event) => <li key={event}>{EVOLUTION_WEBHOOK_EVENT_LABELS[event as EvolutionWebhookEvent] ?? event}</li>)}</ul>
        <Button variant="outline" disabled={!data.instance || register.isPending} onClick={() => register.mutate(undefined)}>Registrar na instância</Button>
        {(data.error || data.webhookError) && <p role="alert">{data.webhookError ?? data.error}</p>}
        <p className="text-sm text-muted-foreground">{data.lastEvent ? `Último evento: ${new Date(data.lastEvent.at).toLocaleString("pt-BR")} · ${data.lastEvent.event} · ${data.lastEvent.ok ? "Recebido" : "Falhou"} ${data.lastEvent.message ?? ""}` : "Nenhum evento recebido"}</p>
    </CardContent></Card>
}

export function OperationsTab({ instance }: { instance: string }) {
    const [kind, setKind] = useState<ContactKind>("chats")
    const [selected, setSelected] = useState<string[]>([])
    const contacts = useEvolution<EvolutionContactDto[]>(`/evolution/contacts?kind=${kind}`, Boolean(instance))
    const sync = useEvolutionAction("/evolution/contacts", "post", "Fotos e nomes sincronizados")
    const send = useEvolutionAction("/evolution/send-test", "post", "Mensagem de teste enviada")
    const check = useEvolutionAction<EvolutionNumberCheckDto>("/evolution/check-number", "post", "Número consultado")
    const sendForm = useForm({ resolver: zodResolver(sendTestSchema), defaultValues: { number: "", text: "" } })
    const checkForm = useForm({ resolver: zodResolver(checkNumberSchema), defaultValues: { number: "" } })
    if (!instance) return <p>Escolha a instância do WhatsApp na aba Instância.</p>
    return <>
        <Card><CardHeader><CardTitle>Contatos, grupos e conversas</CardTitle></CardHeader><CardContent className="space-y-4">
            <OptionTabs value={kind} onChange={(value) => { setKind(value); setSelected([]) }} aria-label="Tipo de conversa" options={[{ value: "chats", label: "Conversas" }, { value: "contacts", label: "Contatos" }, { value: "groups", label: "Grupos" }]} />
            <ConversationPicker items={contacts.data ?? []} selected={selected} onChange={setSelected} />
            {contacts.isError && <Button variant="outline" onClick={() => void contacts.refetch()}>Tentar novamente</Button>}
            <Button variant="outline" disabled={sync.isPending} onClick={() => sync.mutate(undefined)}>Sincronizar fotos e nomes</Button>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Enviar mensagem de teste</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={sendForm.handleSubmit((input) => send.mutate(input))}>
            <Field label="Número com DDI e DDD" id="evolution-test-number" error={sendForm.formState.errors.number?.message}><Input id="evolution-test-number" type="tel" {...sendForm.register("number")} /></Field>
            <Field label="Mensagem" id="evolution-test-text" error={sendForm.formState.errors.text?.message}><Textarea id="evolution-test-text" {...sendForm.register("text")} /></Field>
            <Button type="submit" disabled={send.isPending}>Enviar teste</Button>
        </form></CardContent></Card>
        <Card><CardHeader><CardTitle>Consultar número</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={checkForm.handleSubmit((input) => check.mutate(input))}>
            <Field label="Número com DDI e DDD" id="evolution-check-number" error={checkForm.formState.errors.number?.message}><Input id="evolution-check-number" type="tel" {...checkForm.register("number")} /></Field>
            <Button type="submit" disabled={check.isPending}>Consultar WhatsApp</Button>
            {check.data && <p role="status">{check.data.number}: {check.data.exists ? "Tem WhatsApp" : "Não encontrado no WhatsApp"}</p>}
        </form></CardContent></Card>
    </>
}
