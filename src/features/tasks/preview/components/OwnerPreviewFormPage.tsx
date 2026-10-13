"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, Github, Loader2, Sparkles } from "lucide-react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { MarkdownField } from "@/components/ui/markdown-field"
import { SearchPicker } from "@/components/ui/search-picker"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { GithubRepoLabel } from "@/features/github/components/shared"
import { repoLabelOption, useRepoIndex } from "@/features/github/components/RepoIndexProvider"
import { clienteDraftSchema, type ClienteDraftInput } from "@/features/orcamentos/schemas"
import { useOwnerAttachmentClient, usePendingAttachments } from "@/features/tasks/attachments/hooks"
import { PendingAttachmentsField } from "@/features/tasks/attachments/components/PendingAttachmentsField"
import { TASKS_PATH, taskPreviewPath } from "../../constants"
import { useTaskOptions } from "../../hooks/useTasks"
import { useCreateOwnerDraft } from "../hooks"

/**
 * Primeira etapa da **prévia do dono** (`/tarefas/previa`): escolhe o repositório e descreve a tarefa.
 * Ao avançar, abre o rascunho e segue para a revisão da prévia da IA.
 */
export function OwnerPreviewFormPage() {
    const router = useRouter()
    const options = useTaskOptions()
    const create = useCreateOwnerDraft()
    const attachmentClient = useOwnerAttachmentClient()
    const pending = usePendingAttachments(attachmentClient)
    const repoIndex = useRepoIndex()
    const form = useForm<ClienteDraftInput>({ resolver: zodResolver(clienteDraftSchema), mode: "onChange", defaultValues: { projectId: "", description: "" } })
    const errors = form.formState.errors
    const projects = options.data?.projects ?? []

    return (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-6">
            <header className="space-y-3">
                <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5">
                    <Link href={TASKS_PATH}>
                        <ArrowLeft className="h-4 w-4" aria-hidden /> Tarefas
                    </Link>
                </Button>
                <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
                        <Sparkles className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                        <h1 className="text-lg font-semibold md:text-2xl">Nova prévia</h1>
                        <p className="text-sm text-muted-foreground">Escolha o repositório e descreva o que precisa. A IA gera uma prévia para você revisar antes de criar a tarefa.</p>
                    </div>
                </div>
            </header>

            {options.isLoading ? (
                <Card>
                    <CardContent className="space-y-4 pt-6" aria-label="Carregando formulário">
                        <div className="h-9 w-full animate-pulse rounded bg-muted" />
                        <div className="h-40 w-full animate-pulse rounded bg-muted" />
                    </CardContent>
                </Card>
            ) : options.isError ? (
                <ErrorState title="Não foi possível carregar" description={apiErrorMessage(options.error, "Tente novamente.")} onRetry={() => void options.refetch()} />
            ) : projects.length === 0 ? (
                <EmptyState icon={Github} title="Nenhum repositório vinculado" description="Vincule um repositório em Integrações › GitHub para gerar uma prévia.">
                    <Button asChild size="sm" variant="outline">
                        <Link href="/integracoes/github">Ir para a integração GitHub</Link>
                    </Button>
                </EmptyState>
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <form
                            className="space-y-5"
                            onSubmit={form.handleSubmit(async (values) => {
                                try {
                                    const draft = await create.mutateAsync({ ...values, attachmentIds: pending.ids })
                                    router.push(taskPreviewPath(draft.id))
                                } catch {
                                    // Erro exibido no campo/estado.
                                }
                            })}
                        >
                            <Field id="preview-repo" label="Repositório" error={errors.projectId?.message}>
                                <Controller
                                    control={form.control}
                                    name="projectId"
                                    render={({ field }) => {
                                        const selected = projects.find((project) => project.id === field.value)
                                        return (
                                            <SearchPicker
                                                trigger={
                                                    <FieldTrigger
                                                        id="preview-repo"
                                                        placeholder="Escolha o repositório"
                                                        invalid={Boolean(errors.projectId)}
                                                        value={selected ? <GithubRepoLabel repo={repoLabelOption(selected.repo, repoIndex)} /> : undefined}
                                                    />
                                                }
                                                items={projects}
                                                getKey={(item) => item.id}
                                                searchKeys={["repo", "name", "sigla"]}
                                                renderItem={(item) => <GithubRepoLabel repo={repoLabelOption(item.repo, repoIndex)} />}
                                                onPick={(item) => field.onChange(item.id)}
                                                matchTriggerWidth
                                                searchLabel="Buscar repositório"
                                                listLabel="Repositórios vinculados"
                                                emptyText="Nenhum repositório vinculado: vincule um em Integrações › GitHub"
                                                emptySearchText="Nenhum repositório encontrado"
                                            />
                                        )
                                    }}
                                />
                            </Field>

                            <Field id="preview-description" label="Descrição" error={errors.description?.message}>
                                <Controller
                                    control={form.control}
                                    name="description"
                                    render={({ field }) => (
                                        <MarkdownField
                                            id="preview-description"
                                            value={field.value}
                                            onChange={field.onChange}
                                            rows={10}
                                            invalid={Boolean(errors.description)}
                                            placeholder="Descreva a tarefa ou o problema (Markdown, imagens por URL, links...)"
                                            uploads={pending.media}
                                        />
                                    )}
                                />
                            </Field>

                            <Field id="preview-attachments" label="Anexos">
                                <PendingAttachmentsField state={pending} />
                            </Field>

                            <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-6">
                                {pending.active > 0 && (
                                    <p className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
                                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Enviando anexos…
                                    </p>
                                )}
                                <Button type="button" variant="ghost" asChild disabled={create.isPending}>
                                    <Link href={TASKS_PATH}>Cancelar</Link>
                                </Button>
                                <Button type="submit" disabled={create.isPending || pending.active > 0 || !form.formState.isValid}>
                                    {create.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                                    Avançar
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}
        </motion.section>
    )
}
