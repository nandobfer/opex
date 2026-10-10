"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AlertTriangle, ExternalLink, FolderGit2, Pencil, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useGithubLinks, useSaveLink } from "../../hooks/useGithub"
import type { GithubLinkDto } from "../../types"
import { NotConfiguredHint } from "../shared"
import { GithubLinkDialog } from "./GithubLinkDialog"
import { RemoveLinkDialog } from "./RemoveLinkDialog"

/** Aba Vínculos: repositório ↔ Opex (o repositório é o Projeto) e a coluna de entrada das issues. */
export function GithubLinksTab({ configured }: { configured: boolean }) {
    const links = useGithubLinks()
    const save = useSaveLink()
    const [editing, setEditing] = useState<{ link: GithubLinkDto | null } | null>(null)
    const [removing, setRemoving] = useState<GithubLinkDto | null>(null)

    if (!configured) return <NotConfiguredHint />
    const list = links.data ?? []

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
            <CardContent>
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
                    <ul className="space-y-2">
                        <AnimatePresence initial={false}>
                            {list.map((link) => (
                                <motion.li key={link.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                                    <LinkRow link={link} onEdit={() => setEditing({ link })} onRemove={() => setRemoving(link)} />
                                </motion.li>
                            ))}
                        </AnimatePresence>
                    </ul>
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

function LinkRow({ link, onEdit, onRemove }: { link: GithubLinkDto; onEdit: () => void; onRemove: () => void }) {
    return (
        <div className={cn("flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start", !link.enabled && "opacity-60")}>
            <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                    <a href={link.repoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-sm font-semibold text-primary hover:underline">
                        {link.repo} <ExternalLink className="h-3 w-3" aria-hidden />
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
