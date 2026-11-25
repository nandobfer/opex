"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { ConversationPicker } from "@/features/evolution-api/components/ConversationPicker"
import { useEvolution, useEvolutionAction } from "@/features/evolution-api/hooks/useEvolution"
import type { EvolutionContactDto } from "@/features/evolution-api/types"
import { blockKeyOf, isFixedBlock, type BlockChange, type PersonalityBlock, type PersonalitySnapshot } from "../personality"
import { personalitySchema, variantSchema, type PersonalitySaveInput } from "../schemas"
import { SecondaryModel, type SecretaryForm } from "./SecretaryAgentTab"
import { AnalysisPanel } from "./AnalysisPanel"

export { AnalysisProgress } from "./AnalysisPanel"

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
 * quando não há edição pendente; com edição pendente, a tela avisa, trava o Salvar e o dono escolhe recarregar. O
 * próprio salvamento passa a ser a versão de referência (não dispara o aviso), e a gravação leva a versão em que a
 * edição se baseou: o servidor recusa (409) se ela mudou no meio.
 */
export function PersonalityEditor({ data, contacts }: { data: Data; contacts: EvolutionContactDto[] }) {
    // `replaced`: a versão que o próprio salvamento substituiu. Enquanto o refetch não chega, `data` ainda vem nela, e
    // isso não é mudança externa (não recarrega o texto antigo nem trava o Salvar).
    const [source, setSource] = useState<{ versionId: string | null; blocks: typeof data.snapshot.base.blocks; replaced?: string | null }>({ versionId: data.versionId, blocks: data.snapshot.base.blocks })
    const [base, setBase] = useState(data.snapshot.base.blocks)
    const [jid, select] = useState<string[]>([])
    const dirty = JSON.stringify(base) !== JSON.stringify(source.blocks)
    const changed = data.versionId !== source.versionId && !(source.replaced !== undefined && data.versionId === source.replaced)
    const reload = () => {
        setSource({ versionId: data.versionId, blocks: data.snapshot.base.blocks })
        setBase(data.snapshot.base.blocks)
    }
    if (changed && !dirty) reload()
    const variant = data.snapshot.variants.find((row) => row.jid === jid[0])
    const save = useEvolutionAction<{ versionId: string }, PersonalitySaveInput>("/secretary/personality", "put", "Personalidade salva")
    const submit = () => {
        const input = personalitySchema.safeParse({ blocks: base })
        if (!input.success) return
        save.mutate({ ...input.data, expectedVersionId: source.versionId }, { onSuccess: (saved) => setSource({ versionId: saved.versionId, blocks: input.data.blocks, replaced: source.versionId }) })
    }
    return <>
        <Card><CardHeader><CardTitle>Personalidade base</CardTitle></CardHeader><CardContent className="space-y-4">
            {changed && dirty && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-dashed p-3 text-sm">
                A personalidade mudou (análise ou restauração) enquanto você editava. Suas edições continuam aqui, mas para salvar é preciso recarregar a versão nova.
                <Button size="sm" variant="outline" onClick={reload}>Recarregar e descartar minhas edições</Button>
            </div>}
            <Blocks blocks={base} setBlocks={setBase} />
            <Button disabled={save.isPending || (changed && dirty)} onClick={submit}>Salvar blocos</Button>
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
