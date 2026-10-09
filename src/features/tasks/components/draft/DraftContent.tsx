"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Loader2, Pencil, RotateCcw, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Markdown } from "@/components/ui/markdown"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { GithubUserLabel } from "@/features/github/components/shared"
import type { TaskDraftDetailDto } from "@/features/github/types"
import { useUpdateDraft } from "../../hooks/useDrafts"

const TABS = [
    { id: "description", label: "Descrição" },
    { id: "comments", label: "Comentários da issue" },
] as const
type TabId = (typeof TABS)[number]["id"]

/** Descrição (prévia com imagens; editável) e comentários da issue (só leitura). */
export function DraftContent({ draft }: { draft: TaskDraftDetailDto }) {
    const [tab, setTab] = useState<TabId>("description")
    return (
        <Card className="min-w-0">
            <CardContent className="space-y-4 pt-4">
                <div role="tablist" aria-label="Seções do rascunho" className="flex gap-1 overflow-x-auto border-b">
                    {TABS.map((item) => {
                        const active = tab === item.id
                        const count = item.id === "comments" ? draft.comments.length : null
                        return (
                            <button
                                key={item.id}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                onClick={() => setTab(item.id)}
                                className={cn("relative whitespace-nowrap px-3 pb-2.5 pt-1 text-sm transition-colors", active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
                            >
                                {item.label}
                                {count ? <span className="ml-1.5 rounded bg-muted px-1.5 font-mono text-[11px]">{count}</span> : null}
                                {active && <motion.span layoutId="draft-detail-tab" className="absolute inset-x-0 -bottom-px h-0.5 rounded bg-primary" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                            </button>
                        )
                    })}
                </div>
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={tab} role="tabpanel" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.18 }}>
                        {tab === "description" ? <DescriptionEditor draft={draft} /> : <IssueComments draft={draft} />}
                    </motion.div>
                </AnimatePresence>
            </CardContent>
        </Card>
    )
}

function DescriptionEditor({ draft }: { draft: TaskDraftDetailDto }) {
    const update = useUpdateDraft(draft.id)
    const [editing, setEditing] = useState(false)
    const [title, setTitle] = useState(draft.title)
    const [body, setBody] = useState(draft.body)
    const edited = draft.edited.filter((field) => field === "title" || field === "body")
    const titleError = title.trim() ? undefined : "Informe o título"

    const start = () => {
        setTitle(draft.title)
        setBody(draft.body)
        setEditing(true)
    }
    const save = async () => {
        if (titleError) return
        const changes = { ...(title.trim() !== draft.title ? { title: title.trim() } : {}), ...(body !== draft.body ? { body } : {}) }
        if (Object.keys(changes).length) await update.mutateAsync(changes).catch(() => null)
        setEditing(false)
    }

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                {draft.imageCount > 0 && <span className="text-xs text-muted-foreground">{draft.imageCount} imagem(ns) da issue vão como anexos no envio.</span>}
                <div className="ml-auto flex gap-1.5">
                    {edited.length > 0 && !editing && (
                        <Button type="button" variant="ghost" size="sm" className="gap-1.5" disabled={update.isPending} onClick={() => update.mutate({ restore: edited })}>
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar da issue
                        </Button>
                    )}
                    {!editing && (
                        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={start}>
                            <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar
                        </Button>
                    )}
                </div>
            </div>
            <AnimatePresence mode="wait" initial={false}>
                {editing ? (
                    <motion.div key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                        <Field id="draft-title" label="Título" error={titleError}>
                            <Input id="draft-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={300} aria-invalid={titleError ? true : undefined} />
                        </Field>
                        <Field id="draft-body" label="Descrição (Markdown)">
                            <Textarea id="draft-body" value={body} onChange={(event) => setBody(event.target.value)} rows={14} className="font-mono text-xs" />
                        </Field>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={update.isPending}>
                                Cancelar
                            </Button>
                            <Button type="button" className="gap-1.5" onClick={() => void save()} disabled={update.isPending || Boolean(titleError)}>
                                {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                                Salvar
                            </Button>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div key="view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm">
                        {draft.previewBody.trim() ? <Markdown>{draft.previewBody}</Markdown> : <p className="italic text-muted-foreground">A issue não tem descrição.</p>}
                        {edited.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Editado aqui: mudanças na issue não sobrescrevem {edited.includes("title") && edited.includes("body") ? "título e descrição" : edited.includes("title") ? "o título" : "a descrição"}.</p>}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

function IssueComments({ draft }: { draft: TaskDraftDetailDto }) {
    if (draft.comments.length === 0) return <p className="py-6 text-center text-sm italic text-muted-foreground">Nenhum comentário na issue.</p>
    return (
        <ul className="space-y-3">
            {draft.comments.map((comment) => (
                <li key={comment.id} className="rounded-md border p-3">
                    <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        {comment.author ? <GithubUserLabel login={comment.author.login} avatarUrl={comment.author.avatarUrl} /> : <span>—</span>}
                        {comment.createdAt && <span>{format(new Date(comment.createdAt), "dd/MM/yy HH:mm", { locale: ptBR })}</span>}
                    </div>
                    <div className="text-sm">
                        <Markdown>{comment.body}</Markdown>
                    </div>
                </li>
            ))}
        </ul>
    )
}
