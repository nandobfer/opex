"use client"

import { useEffect, useMemo } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { SearchPicker } from "@/components/ui/search-picker"
import { Switch } from "@/components/ui/switch"
import { ColumnIconView } from "@/features/tasks/components/column-icons"
import { useTaskBoard } from "@/features/tasks/hooks/useTaskBoard"
import { repoLinkInputSchema, type RepoLinkInput, type RepoLinkValues } from "../../schemas"
import type { GithubLinkDto } from "../../types"
import { useGithubRepos } from "../../hooks/useGithub"
import { FieldTrigger, GithubAvatar } from "../shared"

interface GithubLinkDialogProps {
    open: boolean
    /** Vínculo em edição; `null` = novo. */
    link: GithubLinkDto | null
    links: readonly GithubLinkDto[]
    submitting: boolean
    onSubmit: (values: RepoLinkInput) => Promise<boolean>
    onClose: () => void
}

const EMPTY: RepoLinkInput = { repo: "", entryColumnKey: "", enabled: true }

/**
 * Vínculo repositório ↔ Opex: repositório (lista do token) e a coluna de entrada das issues. O
 * repositório é o Projeto (nome e sigla saem dele).
 */
export function GithubLinkDialog({ open, link, links, submitting, onSubmit, onClose }: GithubLinkDialogProps) {
    const form = useForm<RepoLinkInput, unknown, RepoLinkValues>({ resolver: zodResolver(repoLinkInputSchema), mode: "onChange", defaultValues: EMPTY })
    const repos = useGithubRepos(open)
    const board = useTaskBoard(open)
    const columns = board.columns

    useEffect(() => {
        if (!open) return
        form.reset(link ? { repo: link.repo, entryColumnKey: link.entryColumnKey, enabled: link.enabled } : EMPTY)
    }, [open, link, form])

    const [repo, columnKey] = useWatch({ control: form.control, name: ["repo", "entryColumnKey"] })
    const takenRepos = useMemo(() => new Set(links.filter((item) => item.id !== link?.id).map((item) => item.repo)), [links, link])
    const errors = form.formState.errors
    const selectedColumn = columns.find((column) => column.key === columnKey)

    return (
        <Dialog open={open} onOpenChange={(next) => !next && !submitting && onClose()}>
            <DialogContent className="sm:max-w-2xl">
                <form
                    className="space-y-5"
                    onSubmit={(event) => {
                        event.stopPropagation()
                        void form.handleSubmit(async (values) => {
                            if (await onSubmit(values)) onClose()
                        })(event)
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>{link ? `Editar vínculo de ${link.repo}` : "Novo vínculo"}</DialogTitle>
                        <DialogDescription>As issues novas deste repositório viram tarefas dO Opex na coluna de entrada.</DialogDescription>
                    </DialogHeader>

                    <div className={FORM_GRID}>
                        <Field id="link-repo" label="Repositório" error={errors.repo?.message}>
                            <SearchPicker
                                trigger={<FieldTrigger id="link-repo" placeholder="Escolha o repositório" invalid={Boolean(errors.repo)} value={repo || undefined} />}
                                items={repos.data ?? []}
                                getKey={(item) => item.fullName}
                                searchKeys={["fullName", "description"]}
                                renderItem={(item) => (
                                    <span className="flex min-w-0 flex-1 items-center gap-2">
                                        <GithubAvatar login={item.fullName} avatarUrl={item.ownerAvatarUrl} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate font-medium">{item.fullName}</span>
                                            {item.description && <span className="block truncate text-xs text-muted-foreground">{item.description}</span>}
                                        </span>
                                        {item.private && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Privado" />}
                                    </span>
                                )}
                                onPick={(item) => form.setValue("repo", item.fullName, { shouldValidate: true, shouldDirty: true })}
                                disabledReason={(item) => (takenRepos.has(item.fullName) ? "Já vinculado" : false)}
                                loading={repos.isLoading}
                                matchTriggerWidth
                                searchLabel="Buscar repositório"
                                listLabel="Repositórios"
                                emptyText={repos.isError ? "Não foi possível listar os repositórios (confira o token)" : "Nenhum repositório acessível pelo token"}
                                emptySearchText="Nenhum repositório encontrado"
                            />
                        </Field>

                        <Field id="link-column" label="Coluna de entrada" error={errors.entryColumnKey?.message}>
                            <SearchPicker
                                trigger={
                                    <FieldTrigger
                                        id="link-column"
                                        placeholder={columns.length ? "Escolha a coluna" : "Crie uma coluna no quadro"}
                                        invalid={Boolean(errors.entryColumnKey)}
                                        value={
                                            selectedColumn ? (
                                                <span className="flex items-center gap-2">
                                                    <ColumnIconView icon={selectedColumn.column.icon} className="h-3.5 w-3.5 text-muted-foreground" />
                                                    {selectedColumn.label}
                                                </span>
                                            ) : undefined
                                        }
                                    />
                                }
                                items={columns}
                                getKey={(item) => item.key}
                                searchKeys={["label"]}
                                renderItem={(item) => (
                                    <span className="flex items-center gap-2">
                                        <span className={`h-2 w-2 rounded-full ${item.dot}`} aria-hidden />
                                        <ColumnIconView icon={item.column.icon} className="h-3.5 w-3.5 text-muted-foreground" />
                                        {item.label}
                                    </span>
                                )}
                                onPick={(item) => form.setValue("entryColumnKey", item.key, { shouldValidate: true, shouldDirty: true })}
                                loading={board.isLoading}
                                matchTriggerWidth
                                searchLabel="Buscar coluna"
                                listLabel="Colunas"
                                emptyText="Nenhuma coluna: crie uma no quadro de Tarefas"
                                emptySearchText="Nenhuma coluna encontrada"
                            />
                        </Field>

                        <label htmlFor="link-enabled" className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 sm:col-span-2">
                            <span>
                                <span className="block text-sm font-medium">Sincronização ativa</span>
                                <span className="block text-xs text-muted-foreground">Desligado, a rotina ignora este repositório.</span>
                            </span>
                            <Controller control={form.control} name="enabled" render={({ field }) => <Switch id="link-enabled" checked={field.value} onCheckedChange={field.onChange} />} />
                        </label>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={submitting || !form.formState.isValid}>
                            {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                            {link ? "Salvar" : "Vincular"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
