"use client"

import { useEffect } from "react"
import { useForm, type UseFormReturn } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useQueryClient } from "@tanstack/react-query"
import { Bell, Brain, ClipboardList, FlaskConical, ListFilter, MessagesSquare, Settings2, Sparkles } from "lucide-react"
import { acquireChannel, releaseChannel } from "@/lib/pusher/client"
import { appChannel } from "@/lib/pusher/channel-names"
import { AgentSettingsTabs } from "@/features/ai/components/AgentSettingsTabs"
import { SecretaryModelCard } from "./SecretaryModelCard"
import { SecretaryMemories } from "./SecretaryMemories"
import { useAiProviderStatuses } from "@nandobfer/integracoes/modules/integrations/ia/features/ai/hooks/useAi"
import { isOpexProviderId } from "@/features/opex-agent/constants"
import { useEvolution, useEvolutionAction, useEvolutionRealtime } from "@/features/evolution-api/hooks/useEvolution"
import { EVOLUTION_QUERY_KEY } from "@/features/evolution-api/constants"
import type { EvolutionContactDto, EvolutionInstancesDto } from "@/features/evolution-api/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { Input } from "@/components/ui/input"
import { OptionTabs } from "@/components/ui/option-tabs"
import { SearchPicker } from "@/components/ui/search-picker"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { DEFAULT_SECRETARY_SETTINGS, modelsInUse, secretarySettingsSchema, type SecretarySettings } from "../schemas"
import { SECRETARY_ANALYSIS_EVENT, SECRETARY_CONVERSATION_EVENT, SECRETARY_DECISION_EVENT, SECRETARY_NOTICES_EVENT, SECRETARY_PERSONALITY_EVENT } from "../constants"
import { needsPrice, priceKey } from "../cost"
import { CriteriaTab } from "./CriteriaTab"
import { SimulationTab } from "./simulation/SimulationTab"
import { NoticesTab } from "./NoticesTab"
import { DecisionsTab } from "./decisions/DecisionsTab"
import { ConversationsInbox } from "./conversations/ConversationsInbox"
import { PersonalityTab } from "./PersonalityTab"
import { personalityTabLabel, useSecretaryAnalyses } from "../hooks/useSecretaryAnalyses"

export type SecretaryForm = UseFormReturn<SecretarySettings>
const endpoint = "/ai/features/secretary-agent"
const events = [SECRETARY_ANALYSIS_EVENT, SECRETARY_CONVERSATION_EVENT, SECRETARY_DECISION_EVENT, SECRETARY_NOTICES_EVENT, SECRETARY_PERSONALITY_EVENT, "ai-feature-updated", "pusher:subscription_succeeded"]


export function SecretaryAgentTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const cache = useQueryClient()
    useEvolutionRealtime()
    useEffect(() => {
        const name = appChannel(), channel = acquireChannel(name)
        if (!channel) return
        const refresh = () => { void cache.invalidateQueries({ predicate: ({ queryKey }) => queryKey[0] === EVOLUTION_QUERY_KEY && (queryKey[1] === endpoint || String(queryKey[1]).startsWith("/secretary/")) }) }
        events.forEach((event) => channel.bind(event, refresh))
        return () => { events.forEach((event) => channel.unbind(event, refresh)); releaseChannel(name) }
    }, [cache])
    const config = useEvolution<{ settings: SecretarySettings }>(endpoint)
    const contacts = useEvolution<EvolutionContactDto[]>("/evolution/contacts?kind=chats")
    const notices = useEvolution<{ pending: number }>("/secretary/notices")
    const { active: analysis } = useSecretaryAnalyses()
    const save = useEvolutionAction<{ settings: SecretarySettings }, SecretarySettings>(endpoint, "put", "Configuração salva")
    const form = useForm({ resolver: zodResolver(secretarySettingsSchema), defaultValues: DEFAULT_SECRETARY_SETTINGS, values: config.data?.settings, mode: "onChange", resetOptions: { keepDirtyValues: true } })
    const dirty = form.formState.isDirty
    useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false) }, [dirty, onDirtyChange])
    if (config.isPending) return <div className="grid gap-6"><Skeleton className="h-12" /><Skeleton className="h-48" /><Skeleton className="h-64" /></div>
    if (config.isError) return <Button variant="outline" onClick={() => void config.refetch()}>Tentar novamente</Button>
    return <AgentSettingsTabs fallback="geral" label="Agente Secretário" tabs={[
        { id: "geral", label: "Geral", icon: Settings2 }, { id: "criterios", label: "Critérios", icon: ListFilter }, { id: "decisoes", label: "Decisões", icon: ClipboardList }, { id: "simulacao", label: "Simulação", icon: FlaskConical },
        { id: "personalidade", label: personalityTabLabel(analysis), icon: Sparkles }, { id: "memorias", label: "Memórias", icon: Brain },
        { id: "conversas", label: "Conversas", icon: MessagesSquare }, { id: "avisos", label: "Avisos", icon: Bell, badge: notices.data?.pending || null },
    ]}>{(section) => {
        const contactItems = contacts.data ?? []
        return <>
            {section === "geral" && <GeneralSettings form={form} />}
            {section === "criterios" && <CriteriaTab form={form} contacts={contactItems} />}
            {section === "decisoes" && <DecisionsTab contacts={contactItems} />}
            {section === "simulacao" && <SimulationTab form={form} contacts={contactItems} />}
            {section === "personalidade" && <PersonalityTab form={form} contacts={contactItems} />}
            {section === "memorias" && <SecretaryMemories />}
            {section === "conversas" && <ConversationsInbox minutes={form.getValues("pauseMinutes")} contacts={contactItems} />}
            {section === "avisos" && <NoticesTab />}
            {(section === "geral" || section === "criterios" || section === "personalidade") && dirty && <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => form.reset(config.data?.settings)}>Desfazer configuração</Button>
                <Button disabled={save.isPending} onClick={() => void form.handleSubmit((input) => save.mutate(input, { onSuccess: (saved) => form.reset(saved.settings) }))()}>Salvar configuração</Button>
                {Object.keys(form.formState.errors).length > 0 && <p role="alert" className="text-sm text-destructive">Revise os campos destacados nas abas de configuração.</p>}
            </div>}
        </>
    }}</AgentSettingsTabs>
}

export function SecondaryModel({ form, field, label }: { form: SecretaryForm; field: "media.model" | "analysis.model"; label: string }) {
    const providers = useAiProviderStatuses().providers.filter((item) => isOpexProviderId(item.id))
    const same = form.watch(`${field}.sameAsAgent`)
    return <div className="space-y-3"><OptionTabs aria-label={label} value={same ? "same" : "own"} options={[{ value: "same", label: "Mesmo do agente" }, { value: "own", label: "Outro modelo" }]} onChange={(value) => form.setValue(`${field}.sameAsAgent`, value === "same", { shouldDirty: true, shouldValidate: true })} />
        {!same && <SecretaryModelCard form={form} providers={providers} prefix={field} idPrefix={field} />}</div>
}

function GeneralSettings({ form }: { form: SecretaryForm }) {
    const providers = useAiProviderStatuses().providers.filter((item) => isOpexProviderId(item.id))
    const instances = useEvolution<EvolutionInstancesDto>("/evolution/instances")
    const settings = form.watch()
    const set = <K extends "enabled" | "instance" | "mode" | "media.readImages" | "media.transcribeAudio" | "human.typing" | "human.splitMessages" | "human.markRead">(key: K, value: Parameters<SecretaryForm["setValue"]>[1]) => {
        form.setValue(key, value as never, { shouldDirty: true, shouldValidate: true })
    }
    const numberFields = [["human.groupingSeconds", "Agrupar mensagens (s)"], ["human.delayMinSeconds", "Atraso mínimo (s)"], ["human.delayMaxSeconds", "Atraso máximo (s)"], ["pauseMinutes", "Pausa quando o dono responde (min)"], ["limits.repliesPerHour", "Respostas por conversa por hora"], ["limits.dailyBudgetUsd", "Orçamento diário (US$)"]] as const
    const prices = [...new Map(modelsInUse(settings).filter((item) => needsPrice(item.provider)).map((item) => [priceKey(item.provider, item.model), item])).entries()]
    return <>
        <SecretaryModelCard form={form} providers={providers} prefix="main" idPrefix="secretary-main" />
        <Card><CardHeader><CardTitle>Funcionamento</CardTitle></CardHeader><CardContent className="space-y-4">
            <label className="flex items-center gap-2"><Switch checked={settings.enabled} onCheckedChange={(value) => set("enabled", value)} /> Ligar agente</label>
            <SearchPicker items={instances.data?.instances ?? []} getKey={(item) => item.name} searchKeys={["name"]} renderItem={(item) => item.name} onPick={(item) => set("instance", item.name)} trigger={<FieldTrigger placeholder="Instância do WhatsApp" value={settings.instance || undefined} />} searchLabel="Buscar instância" listLabel="Instâncias" emptyText="Configure a Evolution API primeiro" emptySearchText="Nenhuma instância encontrada" />
            {form.formState.errors.instance?.message && <p role="alert">{form.formState.errors.instance.message}</p>}
            <OptionTabs aria-label="Modo" value={settings.mode} options={[{ value: "reply", label: "Responder" }, { value: "observe", label: "Só observar" }]} onChange={(value) => set("mode", value)} />
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Mídia</CardTitle></CardHeader><CardContent className="space-y-4">
            <label className="flex items-center gap-2"><Switch checked={settings.media.readImages} onCheckedChange={(value) => set("media.readImages", value)} /> Ler imagens</label>
            <label className="flex items-center gap-2"><Switch checked={settings.media.transcribeAudio} onCheckedChange={(value) => set("media.transcribeAudio", value)} /> Transcrever áudios</label>
            <SecondaryModel form={form} field="media.model" label="Modelo de mídia" />
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Comportamento humano e limites</CardTitle></CardHeader><CardContent className="space-y-4">
            {numberFields.map(([key, label]) => <Field key={key} id={key} label={label} error={form.getFieldState(key).error?.message}><Input id={key} type="number" step={key === "limits.dailyBudgetUsd" ? "0.01" : "1"} {...form.register(key, { valueAsNumber: true })} /></Field>)}
            {([["human.typing", "Mostrar digitando…"], ["human.splitMessages", "Dividir em mensagens curtas"], ["human.markRead", "Marcar como lida ao responder"]] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2"><Switch checked={form.watch(key)} onCheckedChange={(value) => set(key, value)} />{label}</label>)}
        </CardContent></Card>
        {prices.length > 0 && <Card><CardHeader><CardTitle>Preços estimados · US$ / 1 milhão de tokens</CardTitle></CardHeader><CardContent className="space-y-4">
            {prices.flatMap(([id, model]) => (["inputPerMTok", "outputPerMTok"] as const).map((metric) => <Field key={`${id}:${metric}`} id={`${id}:${metric}`} label={`${model.model} · ${metric === "inputPerMTok" ? "Entrada" : "Saída"}`}>
                <Input id={`${id}:${metric}`} type="number" min={0} step="any" value={settings.pricing[id]?.[metric] ?? ""} onChange={(event) => form.setValue("pricing", { ...settings.pricing, [id]: { inputPerMTok: settings.pricing[id]?.inputPerMTok ?? 0, outputPerMTok: settings.pricing[id]?.outputPerMTok ?? 0, [metric]: event.target.valueAsNumber } }, { shouldDirty: true, shouldValidate: true })} />
            </Field>))}
            {Object.keys(form.formState.errors.pricing ?? {}).length > 0 && <p role="alert">Informe preços válidos para os modelos selecionados.</p>}
        </CardContent></Card>}
    </>
}
