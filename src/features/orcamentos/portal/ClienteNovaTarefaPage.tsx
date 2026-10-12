"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, Loader2, Plus } from "lucide-react"
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
import { usePendingAttachments } from "@/features/tasks/attachments/hooks"
import { PendingAttachmentsField } from "@/features/tasks/attachments/components/PendingAttachmentsField"
import { clienteDraftSchema, type ClienteDraftInput } from "../schemas"
import { repoLabel } from "../logic"
import { clienteRevisaoPath, clienteTarefasPath } from "../constants"
import { useClienteAttachmentClient, useClienteOptions, useCreateDraft } from "./hooks"

/** Nova tarefa do portal: repositório permitido + descrição formatada. */
export function ClienteNovaTarefaPage() {
    const router = useRouter()
    const options = useClienteOptions()
    const create = useCreateDraft()
    const attachmentClient = useClienteAttachmentClient()
    const pending = usePendingAttachments(attachmentClient)
    const form = useForm<ClienteDraftInput>({ resolver: zodResolver(clienteDraftSchema), mode: "onChange", defaultValues: { projectId: "", description: "" } })
    const errors = form.formState.errors
    const projects = options.data?.projects ?? []

    return (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-5">
            <header className="space-y-3">
                <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5">
                    <Link href={clienteTarefasPath()}>
                        <ArrowLeft className="h-4 w-4" aria-hidden /> Tarefas
                    </Link>
                </Button>
                <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
                        <Plus className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                        <h1 className="text-lg font-semibold md:text-2xl">Nova tarefa</h1>
                        <p className="text-sm text-muted-foreground">Escolha o repositório e descreva o que precisa. A IA vai gerar uma prévia para você revisar.</p>
                    </div>
                </div>
            </header>

            {options.isLoading ? (
                <Card>
                    <CardContent className="space-y-4 pt-6" aria-label="Carregando">
                        <div className="h-9 w-full animate-pulse rounded bg-muted" />
                        <div className="h-40 w-full animate-pulse rounded bg-muted" />
                    </CardContent>
                </Card>
            ) : options.isError ? (
                <ErrorState title="Não foi possível carregar" description={apiErrorMessage(options.error, "Tente novamente.")} onRetry={() => void options.refetch()} />
            ) : projects.length === 0 ? (
                <EmptyState icon={Plus} title="Nenhum repositório disponível" description="Fale com a equipe para liberar seus repositórios." />
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <form
                            className="space-y-5"
                            onSubmit={form.handleSubmit(async (values) => {
                                try {
                                    const draft = await create.mutateAsync({ ...values, attachmentIds: pending.ids })
                                    router.push(clienteRevisaoPath(draft.id))
                                } catch {
                                    // Erro mostrado no campo/estado.
                                }
                            })}
                        >
                            <Field id="cliente-repo" label="Repositório" error={errors.projectId?.message}>
                                <Controller
                                    control={form.control}
                                    name="projectId"
                                    render={({ field }) => {
                                        const selected = projects.find((project) => project.id === field.value)
                                        return (
                                            <SearchPicker
                                                trigger={
                                                    <FieldTrigger
                                                        id="cliente-repo"
                                                        placeholder="Escolha o repositório"
                                                        invalid={Boolean(errors.projectId)}
                                                        value={selected ? <GithubRepoLabel repo={repoLabel(selected)} /> : undefined}
                                                    />
                                                }
                                                items={projects}
                                                getKey={(item) => item.id}
                                                searchKeys={["repo", "name", "sigla"]}
                                                renderItem={(item) => <GithubRepoLabel repo={repoLabel(item)} />}
                                                onPick={(item) => field.onChange(item.id)}
                                                matchTriggerWidth
                                                searchLabel="Buscar repositório"
                                                listLabel="Repositórios"
                                                emptyText="Nenhum repositório disponível"
                                                emptySearchText="Nenhum repositório encontrado"
                                            />
                                        )
                                    }}
                                />
                            </Field>

                            <Field id="cliente-description" label="Descrição" error={errors.description?.message}>
                                <Controller
                                    control={form.control}
                                    name="description"
                                    render={({ field }) => <MarkdownField id="cliente-description" value={field.value} onChange={field.onChange} rows={10} placeholder="Descreva a tarefa (Markdown, imagens por URL, links...)" invalid={Boolean(errors.description)} uploads={pending.media} />}
                                />
                            </Field>

                            <Field id="cliente-attachments" label="Anexos">
                                <PendingAttachmentsField state={pending} />
                            </Field>

                            <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-6">
                                {pending.active > 0 && (
                                    <p className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
                                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Enviando anexos…
                                    </p>
                                )}
                                <Button type="button" variant="ghost" asChild disabled={create.isPending}>
                                    <Link href={clienteTarefasPath()}>Cancelar</Link>
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
