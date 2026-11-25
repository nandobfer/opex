"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ConversationLabel, ConversationPicker } from "@/features/evolution-api/components/ConversationPicker"
import { useEvolution, useEvolutionAction } from "@/features/evolution-api/hooks/useEvolution"
import type { EvolutionContactDto } from "@/features/evolution-api/types"
import { ANALYSIS_CHAT_STATE_LABELS, ANALYSIS_PHASE_LABELS, ANALYSIS_STATUS_LABELS, type AnalysisChatState, type AnalysisPhase, type AnalysisStatus } from "../constants"
import { blockKeyOf, isFixedBlock, type BlockChange, type PersonalityBlock, type PersonalitySnapshot } from "../personality"
import { analysisStartSchema, personalitySchema, variantSchema, type AnalysisStartInput } from "../schemas"
import { SecondaryModel, type SecretaryForm } from "./SecretaryAgentTab"

interface History { _id: string; origin: string; at: string; changes: BlockChange[] }
interface Data { versionId: string | null; snapshot: PersonalitySnapshot; versions: History[] }

export function PersonalityTab({ form, contacts }: { form: SecretaryForm; contacts: EvolutionContactDto[] }) {
    const query = useEvolution<Data>("/secretary/personality")
    if (query.isPending) return <Skeleton className="h-96" />
    if (!query.data) return <Button variant="outline" onClick={() => void query.refetch()}>Tentar novamente</Button>
    return <>
        <Card><CardHeader><CardTitle>Modelo da análise</CardTitle></CardHeader><CardContent><SecondaryModel form={form} field="analysis.model" label="Modelo da análise" /></CardContent></Card>
        <AnalysisPanel contacts={contacts} />
        <PersonalityEditor data={query.data} contacts={contacts} />
        <Card><CardHeader><CardTitle>Histórico de versões</CardTitle></CardHeader><CardContent className="space-y-3">
            {query.data.versions.length === 0 && <p>Nenhuma versão registrada.</p>}
            {query.data.versions.map((version) => <VersionItem key={version._id} version={version} />)}
        </CardContent></Card>
    </>
}

/**
 * Editor da base e das variantes. Uma versão nova (análise concluída, restauração) só substitui o que está na tela
 * quando não há edição pendente; com edição pendente, a tela avisa e o dono escolhe recarregar.
 */
export function PersonalityEditor({ data, contacts }: { data: Data; contacts: EvolutionContactDto[] }) {
    const [source, setSource] = useState({ versionId: data.versionId, blocks: data.snapshot.base.blocks })
    const [base, setBase] = useState(data.snapshot.base.blocks)
    const [jid, select] = useState<string[]>([])
    const dirty = JSON.stringify(base) !== JSON.stringify(source.blocks)
    const changed = data.versionId !== source.versionId
    const reload = () => {
        setSource({ versionId: data.versionId, blocks: data.snapshot.base.blocks })
        setBase(data.snapshot.base.blocks)
    }
    if (changed && !dirty) reload()
    const variant = data.snapshot.variants.find((row) => row.jid === jid[0])
    const save = useEvolutionAction("/secretary/personality", "put", "Personalidade salva")
    return <>
        <Card><CardHeader><CardTitle>Personalidade base</CardTitle></CardHeader><CardContent className="space-y-4">
            {changed && dirty && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-dashed p-3 text-sm">
                A personalidade mudou (análise ou restauração) enquanto você editava. Suas edições continuam aqui.
                <Button size="sm" variant="outline" onClick={reload}>Recarregar e descartar minhas edições</Button>
            </div>}
            <Blocks blocks={base} setBlocks={setBase} />
            <Button disabled={save.isPending} onClick={() => { const input = personalitySchema.safeParse({ blocks: base }); if (input.success) save.mutate(input.data) }}>Salvar blocos</Button>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Variantes por conversa</CardTitle></CardHeader><CardContent className="space-y-4">
            <ConversationPicker items={contacts} selected={jid} onChange={select} multiple={false} />
            {data.snapshot.variants.map((item) => <Button key={item.jid} variant="ghost" onClick={() => select([item.jid])}>{item.title}{item.origin === "analysis" ? " · Criada pela análise" : ""}</Button>)}
            {jid[0] && <VariantEditor key={jid[0]} jid={jid[0]} title={variant?.title ?? contacts.find((item) => item.jid === jid[0])?.name ?? ""} initial={variant?.blocks ?? []} base={base} exists={Boolean(variant)} />}
        </CardContent></Card>
    </>
}

function Blocks({ blocks, setBlocks, fixed = true }: { blocks: PersonalityBlock[]; setBlocks: (blocks: PersonalityBlock[]) => void; fixed?: boolean }) {
    const [title, setTitle] = useState("")
    function add() {
        if (!title.trim() || blocks.length >= 40) return
        setBlocks([...blocks, { title: title.trim(), key: blockKeyOf(title, blocks.map((item) => item.key)), content: "" }]); setTitle("")
    }
    return <div className="space-y-4">
        {blocks.map((block) => <div key={block.key} className="space-y-2">
            <label className="block">{block.title}<Textarea className="mt-1" value={block.content} maxLength={8000} onChange={(event) => setBlocks(blocks.map((item) => item.key === block.key ? { ...item, content: event.target.value } : item))} /></label>
            {(!fixed || !isFixedBlock(block.key)) && <Button size="sm" variant="ghost" onClick={() => setBlocks(blocks.filter((item) => item.key !== block.key))}>Remover bloco</Button>}
        </div>)}
        <Input aria-label="Título do bloco extra" placeholder="Título do bloco extra" value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} />
        <Button variant="outline" disabled={!title.trim()} onClick={add}>Adicionar bloco</Button>
    </div>
}

function VariantEditor({ jid, title, initial, base, exists }: { jid: string; title: string; initial: PersonalityBlock[]; base: PersonalityBlock[]; exists: boolean }) {
    const [name, setName] = useState(title)
    const [blocks, setBlocks] = useState(initial)
    const [confirm, setConfirm] = useState(false)
    const path = `/secretary/personality/variants/${encodeURIComponent(jid)}`
    const save = useEvolutionAction(path, "put", "Variante salva")
    const remove = useEvolutionAction(path, "delete", "Variante excluída")
    return <div className="space-y-3">
        <Input aria-label="Nome da variante" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
        <div className="flex flex-wrap gap-2">{base.filter((item) => !blocks.some((block) => block.key === item.key)).map((item) => <Button key={item.key} size="sm" variant="outline" onClick={() => setBlocks([...blocks, { ...item, content: "" }])}>+ {item.title}</Button>)}</div>
        <Blocks blocks={blocks} setBlocks={setBlocks} fixed={false} />
        <Button disabled={!name.trim() || save.isPending} onClick={() => { const input = variantSchema.safeParse({ jid, title: name, blocks }); if (input.success) save.mutate(input.data) }}>Salvar variante</Button>
        {exists && <Button className="ml-2" variant="outline" onClick={() => setConfirm(true)}>Excluir variante</Button>}
        <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Excluir variante?" confirmLabel="Excluir" variant="destructive" pending={remove.isPending} onConfirm={() => remove.mutate(undefined, { onSuccess: () => setConfirm(false) })} />
    </div>
}

function VersionItem({ version }: { version: History }) {
    const [confirm, setConfirm] = useState(false)
    const restore = useEvolutionAction(`/secretary/personality/versions/${version._id}/restore`, "post", "Versão restaurada")
    const labels: Record<string, string> = { edit: "Edição", analysis: "Análise", "analysis-cancelled": "Análise cancelada", "analysis-unapplied": "Análise não aplicada", restore: "Restauração" }
    return <details className="rounded-md border p-3"><summary>{labels[version.origin] ?? version.origin} · {new Date(version.at).toLocaleString("pt-BR")} · {version.changes.length} alterações</summary>
        {version.changes.map((change) => <div key={`${change.scope}:${change.key}`} className="my-2 border-b pb-2 text-sm"><p className="font-medium">{change.scopeTitle} · {change.title}</p>{change.before && <p className="whitespace-pre-wrap text-muted-foreground">Antes: {change.before}</p>}{change.after && <p className="whitespace-pre-wrap">Depois: {change.after}</p>}</div>)}
        <Button variant="outline" onClick={() => setConfirm(true)}>Restaurar</Button>
        <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Restaurar esta versão?" description="A personalidade anterior continua no histórico." confirmLabel="Restaurar" pending={restore.isPending} onConfirm={() => restore.mutate(undefined, { onSuccess: () => setConfirm(false) })} />
    </details>
}

type AnalysisDto = { _id: string; status: AnalysisStatus; phase: AnalysisPhase; at: string; chats: { jid: string; state: AnalysisChatState }[]; current?: string; messages: number; cost: number; discoveries: string[]; error?: string }

function AnalysisPanel({ contacts }: { contacts: EvolutionContactDto[] }) {
    const [scope, setScope] = useState<AnalysisStartInput["scope"]>("all")
    const [jids, setJids] = useState<string[]>([])
    const [months, setMonths] = useState("6")
    const query = useEvolution<AnalysisDto[]>("/secretary/analyses", true, 15_000)
    const start = useEvolutionAction("/secretary/analyses", "post", "Análise iniciada")
    const active = query.data?.find((row) => row.status === "running")
    const cancel = useEvolutionAction(`/secretary/analyses/${active?._id}/cancel`, "post", "Cancelamento solicitado")
    const parsed = analysisStartSchema.safeParse({ scope, jids, months: months ? Number(months) : null })
    return <Card><CardHeader><CardTitle>Analisar minhas conversas</CardTitle></CardHeader><CardContent className="space-y-4">
        <OptionTabs aria-label="Conversas da análise" value={scope} onChange={setScope} options={[{ value: "all", label: "Todas" }, { value: "selected", label: "Escolhidas" }]} />
        {scope === "selected" && <ConversationPicker items={contacts} selected={jids} onChange={setJids} />}
        <label className="block">Últimos meses (vazio para todo o histórico)<Input type="number" min={1} max={60} value={months} onChange={(event) => setMonths(event.target.value)} /></label>
        <Button disabled={Boolean(active) || !parsed.success || start.isPending} onClick={() => { if (parsed.success) start.mutate(parsed.data) }}>Iniciar análise</Button>
        {active && <Button className="ml-2" variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate(undefined)}>Cancelar análise</Button>}
        {query.isError && <Button variant="outline" onClick={() => void query.refetch()}>Tentar novamente</Button>}
        {query.data?.map((run) => <AnalysisProgress key={run._id} run={run} contacts={contacts} />)}
    </CardContent></Card>
}

function AnalysisProgress({ run, contacts }: { run: AnalysisDto; contacts: EvolutionContactDto[] }) {
    const read = run.chats.filter((item) => item.state === "read" || item.state === "empty").length
    const pct = read / Math.max(1, run.chats.length)
    const [now, setNow] = useState(Date.now)
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 15_000)
        return () => clearInterval(timer)
    }, [])
    const eta = read > 0 && run.status === "running" ? Math.max(1, Math.ceil(((now - Date.parse(run.at)) * (1 - pct)) / pct / 60_000)) : null
    const current = contacts.find((item) => item.jid === run.current)
    return <details open={run.status === "running" || undefined} className="rounded-lg border p-3">
        <summary>{ANALYSIS_STATUS_LABELS[run.status]} · {new Date(run.at).toLocaleString("pt-BR")} · {read} de {run.chats.length} conversas lidas</summary>
        <div className="mt-3 flex items-center gap-3" role="progressbar" aria-valuemin={0} aria-valuemax={run.chats.length} aria-valuenow={read} aria-label="Conversas lidas">
            <svg viewBox="0 0 40 40" className="size-12 text-primary" aria-hidden="true"><circle cx="20" cy="20" r="16" stroke="currentColor" opacity="0.2" strokeWidth="4" fill="none" /><motion.circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="4" fill="none" initial={{ pathLength: 0 }} animate={{ pathLength: pct }} /></svg>
            <div><p>{ANALYSIS_PHASE_LABELS[run.phase]} · {run.messages} mensagens · US$ {run.cost.toFixed(4)}{eta ? ` · ~${eta} min` : ""}</p>{current ? <ConversationLabel contact={current} /> : run.current}</div>
        </div>
        {run.error && <p role="alert">{run.error}</p>}
        <ul className="my-2 divide-y">{run.chats.map((item) => <li key={item.jid} className="py-1 text-sm">{contacts.find((contact) => contact.jid === item.jid)?.name ?? item.jid} · {ANALYSIS_CHAT_STATE_LABELS[item.state]}</li>)}</ul>
        {run.discoveries.length > 0 && <><p className="font-medium">Descobertas</p><ul className="list-inside list-disc text-sm">{run.discoveries.map((item, index) => <li key={index}>{item}</li>)}</ul></>}
    </details>
}
