"use client"

import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import Fuse from "fuse.js"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AlertTriangle, ExternalLink, FolderGit2, Pencil, Plus, Search, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { GithubRepoLabel } from "@/features/github/components/shared"
import { repoLabelOption } from "@/features/github/components/RepoIndexProvider"
import { useGithubLinks, useGithubRepoIndex, useSaveLink } from "../../hooks/useGithub"
import type { GithubLinkDto, GithubRepoLabelData } from "../../types"
import { NotConfiguredHint } from "../shared"
import { GithubLinkDialog } from "./GithubLinkDialog"
import { RemoveLinkDialog } from "./RemoveLinkDialog"

/** Aba Vínculos: repositório ↔ Opex (o repositório é o Projeto) e a coluna de entrada das issues. */
export function GithubLinksTab({ configured }: { configured: boolean }) {
    const links = useGithubLinks()
    const save = useSaveLink()
    const repoIndex = useGithubRepoIndex(configured)
    const [editing, setEditing] = useState<{ link: GithubLinkDto | null } | null>(null)
    const [removing, setRemoving] = useState<GithubLinkDto | null>(null)
    const [term, setTerm] = useState("")

    const list = useMemo(() => links.data ?? [], [links.data])
    const fuse = useMemo(() => new Fuse(list, { keys: ["repo", "name", "sigla"], threshold: 0.35, ignoreLocation: true }), [list])
    const visible = term.trim() ? fuse.search(term.trim()).map((result) => result.item) : list

    if (!configured) return <NotConfiguredHint />

    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                    <CardTitle className="text-base">Vínculos</CardTitle>
                    <CardDescription>Cada repositório vinculado vira um Projeto: as issues novas viram tarefas dO Opex na coluna de entrada.</CardDescription>
                </div>
                <Button type="button" size="sm" className="gap-1.5" onClick={() => setEditing({ link: null })}>
                    <Plus className="h-4 w-4" aria-hidden /> Novo vínculo
                </Button>
            </CardHeader>
            <CardContent className="space-y-3">
                {links.isLoading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-20 w-full" />
                    </div>
                ) : links.isError ? (
                    <ErrorState title="Não foi possível carregar os vínculos" description={apiErrorMessage(links.error, "Tente novamente.")} onRetry={() => void links.refetch()} />
                ) : list.length === 0 ? (
                    <EmptyState icon={FolderGit2} title="Nenhum repositório vinculado" description="Vincule um repositório para que as issues virem tarefas dO Opex." actionLabel="Novo vínculo" onAction={() => setEditing({ link: null })} />
                ) : (
                    <>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                            <Input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Buscar repositório" aria-label="Buscar vínculo" className="pl-9" />
                        </div>
                        {visible.length === 0 ? (
                            <p className="p-4 text-center text-sm text-muted-foreground">Nenhum vínculo encontrado</p>
                        ) : (
                            <ul className="space-y-2">
                                <AnimatePresence initial={false}>
                                    {visible.map((link) => (
                                        <motion.li key={link.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                                            <LinkRow link={link} repo={repoLabelOption(link.repo, repoIndex)} onEdit={() => setEditing({ link })} onRemove={() => setRemoving(link)} />
                                        </motion.li>
                                    ))}
                                </AnimatePresence>
                            </ul>
                        )}
                    </>
                )}
            </CardContent>

            <GithubLinkDialog
                open={editing !== null}
                link={editing?.link ?? null}
                links={list}
                submitting={save.isPending}
                onClose={() => setEditing(null)}
                onSubmit={async (input) => {
                    try {
                        await save.mutateAsync({ id: editing?.link?.id ?? null, input })
                        return true
                    } catch {
                        return false
                    }
                }}
            />
            <RemoveLinkDialog link={removing} onClose={() => setRemoving(null)} />
        </Card>
    )
}

function LinkRow({ link, repo, onEdit, onRemove }: { link: GithubLinkDto; repo: GithubRepoLabelData; onEdit: () => void; onRemove: () => void }) {
    return (
        <div className={cn("flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start", !link.enabled && "opacity-60")}>
            <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                    <a href={link.repoUrl} target="_blank" rel="noreferrer" className="flex min-w-0 max-w-full items-center gap-2 rounded-md px-1 py-0.5 text-primary hover:bg-primary/5">
                        <GithubRepoLabel repo={repo} />
                        <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                    </a>
                    <span className="rounded-full border px-1.5 font-mono text-[10px] uppercase text-muted-foreground" title="Sigla usada no código das tarefas">
                        {link.sigla}
                    </span>
                    {!link.enabled && <span className="rounded-full border px-1.5 text-[10px] uppercase text-muted-foreground">desativado</span>}
                    {link.taskCount > 0 && <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">{link.taskCount} tarefa(s)</span>}
                </div>
                <p className="text-xs text-muted-foreground">
                    Entrada:{" "}
                    {link.entryColumnName ?? (
                        <span className="inline-flex items-center gap-1 text-warning">
                            <AlertTriangle className="h-3 w-3" aria-hidden /> coluna excluída
                        </span>
                    )}
                </p>
                <p className={cn("text-xs", link.lastSync && !link.lastSync.ok ? "text-destructive" : "text-muted-foreground")}>
                    {link.lastSync
                        ? `Última leitura ${formatDistanceToNow(new Date(link.lastSync.at), { addSuffix: true, locale: ptBR })}: ${link.lastSync.message}`
                        : link.initialImportAt
                          ? "Aguardando a próxima leitura"
                          : "Importação inicial na próxima execução da rotina (issues abertas)"}
                </p>
            </div>
            <div className="flex shrink-0 gap-1">
                <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={onEdit}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar
                </Button>
                <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={onRemove}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remover
                </Button>
            </div>
        </div>
    )
}
