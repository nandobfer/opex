"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Field } from "@/components/ui/field"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { Input } from "@/components/ui/input"
import { SearchPicker } from "@/components/ui/search-picker"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { EVOLUTION_INSTANCE_OPTIONS, EVOLUTION_READ_MESSAGES_LOCKED_REASON, EVOLUTION_STATE_LABELS } from "../constants"
import { useEvolution, useEvolutionAction } from "../hooks/useEvolution"
import { createInstanceSchema, instanceOptionsSchema, phoneNumberSchema } from "../schemas"
import type { EvolutionInstanceDto, EvolutionInstanceOptionsDto, EvolutionInstancesDto, EvolutionProfileDto, EvolutionQrDto } from "../types"
import { profileSecondLine } from "../phone"
import { AvatarLabel } from "@/components/ui/avatar-label"

const PROFILE_AVATAR = "h-12 w-12 text-base"

/** Perfil conectado: nome do WhatsApp em cima; embaixo `@usuário` (quando houver) e o número com máscara. */
export function ConnectedProfile({ profile }: { profile: EvolutionProfileDto }) {
    return <AvatarLabel className="gap-3" avatarClassName={PROFILE_AVATAR} image={profile.pictureUrl} title={profile.name?.trim() || "WhatsApp sem nome de exibição"} subtitle={profileSecondLine(profile.username, profile.number)} subtitleClassName="text-sm" testId="evolution-profile-name" />
}

function ConnectedProfileSkeleton() {
    return <div className="flex items-center gap-3" aria-hidden><Skeleton className={`${PROFILE_AVATAR} rounded-full`} /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-4 w-56" /></div></div>
}

export function QrConnect({ qr }: { qr: EvolutionQrDto }) {
    const [now, setNow] = useState(Date.now)
    useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
    const seconds = Math.max(0, Math.ceil((Date.parse(qr.expiresAt) - now) / 1000))
    return <motion.div key={qr.generatedAt} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
        {seconds > 0 && qr.base64?.startsWith("data:image/png;base64,") && /* eslint-disable-next-line @next/next/no-img-element */
            <img src={qr.base64} alt="QR code de pareamento do WhatsApp" className="size-56 rounded-lg" />}
        <p className="text-sm text-muted-foreground">{seconds > 0 ? `Renova em ${seconds} s · QR ${qr.count} de ${qr.limit}` : "Aguardando renovação do QR code…"}</p>
    </motion.div>
}

export function PairingCode({ code }: { code: string }) {
    return <p className="break-all font-mono text-4xl font-semibold tracking-widest" aria-label="Código de pareamento">{code}</p>
}

export function InstanceTab() {
    const instances = useEvolution<EvolutionInstancesDto>("/evolution/instances")
    const create = useEvolutionAction("/evolution/instances", "post", "Instância criada")
    const select = useEvolutionAction("/evolution/instances", "put", "Instância selecionada")
    const form = useForm({ resolver: zodResolver(createInstanceSchema), defaultValues: { name: "" }, mode: "onChange" })
    const name = instances.data?.defaultInstance
    const items = instances.data?.instances ?? []
    if (instances.isPending) return <Skeleton className="h-56 w-full rounded-xl" />
    return <>
        <Card><CardHeader><CardTitle>Instância do WhatsApp</CardTitle></CardHeader><CardContent className="space-y-4">
            {(instances.isError || instances.data?.error) && <p role="alert">{instances.data?.error ?? "Não foi possível consultar as instâncias."} <Button variant="outline" onClick={() => void instances.refetch()}>Tentar novamente</Button></p>}
            <SearchPicker trigger={<FieldTrigger placeholder="Escolher instância" value={name || undefined} />} items={items} getKey={(item) => item.name} renderItem={(item) => `${item.name} · ${EVOLUTION_STATE_LABELS[item.state]}`} searchKeys={["name", "profileName"]} onPick={(item) => select.mutate({ name: item.name })} searchLabel="Buscar instância" listLabel="Instâncias" emptyText="Nenhuma instância cadastrada" emptySearchText="Nenhuma instância encontrada" disabled={select.isPending} />
            <form className="space-y-3" onSubmit={form.handleSubmit((input) => create.mutate(input, { onSuccess: () => form.reset() }))}>
                <Field id="evolution-instance-name" label="Nome da nova instância" error={form.formState.errors.name?.message}><Input id="evolution-instance-name" {...form.register("name")} /></Field>
                <Button type="submit" disabled={create.isPending || !form.formState.isValid}>Criar instância</Button>
            </form>
        </CardContent></Card>
        {name && <InstanceDetails key={name} name={name} />}
    </>
}

const actions = { restart: "Reiniciar", logout: "Desconectar", delete: "Excluir instância" } as const
type Action = keyof typeof actions

function InstanceDetails({ name }: { name: string }) {
    const path = `/evolution/instances/${encodeURIComponent(name)}`
    const query = useEvolution<EvolutionInstanceDto>(path, true, 8000)
    const connect = useEvolutionAction(path + "/connect", "post", "Pareamento solicitado")
    const [number, setNumber] = useState("")
    const [action, setAction] = useState<Action | null>(null)
    const mutate = useEvolutionAction(action === "delete" ? path : `${path}/${action}`, action === "delete" ? "delete" : "post", "Ação concluída")
    const parsed = phoneNumberSchema.safeParse(number)
    const state = query.data
    return <>
        <Card><CardHeader><CardTitle>Conexão · {state ? EVOLUTION_STATE_LABELS[state.state] : "Consultando…"}</CardTitle></CardHeader><CardContent className="space-y-4">
            {query.isPending && <ConnectedProfileSkeleton />}
            {(state?.error || query.isError) && <p role="alert">{state?.error ?? "Falha ao consultar a conexão."} <Button variant="outline" onClick={() => void query.refetch()}>Tentar novamente</Button></p>}
            {state?.webhookError && <p role="alert">Não foi possível registrar o webhook: {state.webhookError}. Confira a aba Webhook.</p>}
            {state?.profile && <ConnectedProfile profile={state.profile} />}
            {state && state.state !== "connected" && <>
                {state.qrLimitReached && <p>O limite de QR codes foi atingido.</p>}
                {state.qr?.mode === "qr" && <QrConnect qr={state.qr} />}
                {state.qr?.mode === "pairing" && state.qr.pairingCode && <PairingCode code={state.qr.pairingCode} />}
                <Button variant="outline" disabled={connect.isPending} onClick={() => connect.mutate({ mode: "qr" })}>{state.qrLimitReached ? "Gerar novo QR" : "Conectar por QR code"}</Button>
                <Field id="evolution-pairing-number" label="Número com DDI e DDD"><Input id="evolution-pairing-number" type="tel" value={number} onChange={(event) => setNumber(event.target.value)} /></Field>
                <Button variant="outline" disabled={!parsed.success || connect.isPending} onClick={() => { if (parsed.success) connect.mutate({ mode: "pairing", number: parsed.data }) }}>Gerar código de pareamento</Button>
            </>}
            <div className="flex flex-wrap gap-2">{(Object.entries(actions) as [Action, string][]).map(([key, label]) => <Button key={key} variant="outline" onClick={() => setAction(key)}>{label}</Button>)}</div>
            {state?.managerUrl && <a className="text-sm underline" href={state.managerUrl} target="_blank" rel="noreferrer">Abrir Evolution Manager</a>}
        </CardContent></Card>
        <InstanceOptions path={path + "/options"} />
        <ConfirmDialog open={action !== null} onOpenChange={(open) => { if (!open) setAction(null) }} title={action ? `${actions[action]}?` : "Confirmar ação"} items={[name]} confirmLabel={action ? actions[action] : "Confirmar"} pending={mutate.isPending} variant={action === "restart" ? "default" : "destructive"} onConfirm={() => mutate.mutate(undefined, { onSuccess: () => setAction(null) })} />
    </>
}

function InstanceOptions({ path }: { path: string }) {
    const query = useEvolution<EvolutionInstanceOptionsDto>(path)
    const save = useEvolutionAction(path, "put", "Opções gravadas")
    const form = useForm({ resolver: zodResolver(instanceOptionsSchema), values: query.data, mode: "onChange", resetOptions: { keepDirtyValues: true } })
    return <Card><CardHeader><CardTitle>Opções da instância</CardTitle></CardHeader><CardContent>
        {query.isPending ? <Skeleton className="h-48" /> : query.isError ? <Button variant="outline" onClick={() => void query.refetch()}>Tentar novamente</Button> : <form className="space-y-4" onSubmit={form.handleSubmit((input) => save.mutate(input, { onSuccess: () => form.reset(input) }))}>
            {EVOLUTION_INSTANCE_OPTIONS.map((option) => <label key={option.key} className="flex items-center justify-between gap-3"><span>{option.label}<span className="block text-sm text-muted-foreground">{option.description}</span></span><Switch checked={form.watch(option.key) ?? false} onCheckedChange={(value) => form.setValue(option.key, value, { shouldDirty: true })} /></label>)}
            <label className="flex items-center justify-between gap-3"><span>Ler mensagens<span className="block text-sm text-muted-foreground">{EVOLUTION_READ_MESSAGES_LOCKED_REASON}</span></span><Switch checked={false} disabled /></label>
            <Button type="submit" disabled={!form.formState.isDirty || save.isPending}>Salvar opções</Button>
        </form>}
    </CardContent></Card>
}
