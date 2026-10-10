"use client"

import { useEffect, useMemo } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Github, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { MoneyInput } from "@/components/ui/money-input"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { CadastroMultiSelect } from "@/components/list/CadastroMultiSelect"
import { GithubRepoLabel } from "@/features/github/components/shared"
import { repoLabelOption } from "@/features/github/components/RepoIndexProvider"
import type { GithubRepoOption } from "@/features/github/types"
import { useTaskOptions } from "@/features/tasks/hooks/useTasks"
import { clienteOrcamentoSchema, type ClienteOrcamentoInput } from "../../schemas"
import type { ClienteOrcamentoDto } from "../../types"

interface ClienteDialogProps {
    open: boolean
    /** Cliente em edição; `null` = novo. */
    client: ClienteOrcamentoDto | null
    submitting: boolean
    /** Índice `owner/repo` do GitHub, para o rótulo real dos repositórios (`GithubRepoLabel`). */
    repoIndex: ReadonlyMap<string, GithubRepoOption>
    onSubmit: (values: ClienteOrcamentoInput) => Promise<{ token?: string; item: ClienteOrcamentoDto } | null>
    onClose: () => void
}

const EMPTY: ClienteOrcamentoInput = { name: "", projectIds: [], hourlyRate: 0, profitFactor: 1, active: true }

/** Cadastro de um cliente do portal: nome, repositórios permitidos, custo/hora e fator de lucro. */
export function ClienteDialog({ open, client, submitting, repoIndex, onSubmit, onClose }: ClienteDialogProps) {
    const form = useForm<ClienteOrcamentoInput>({ resolver: zodResolver(clienteOrcamentoSchema), mode: "onChange", defaultValues: EMPTY })
    const options = useTaskOptions(open)
    const projects = useMemo(() => options.data?.projects ?? [], [options.data])
    const repoOptions = useMemo(() => projects.map((project) => ({ value: project.id, label: project.repo })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR")), [projects])
    const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects])
    const reposPlaceholder = options.isLoading ? "Carregando…" : options.isError ? "Não foi possível listar os repositórios" : projects.length === 0 ? "Nenhum repositório vinculado" : "Selecionar…"
    const errors = form.formState.errors
    const projectIds = useWatch({ control: form.control, name: "projectIds" })

    useEffect(() => {
        if (!open) return
        form.reset(client ? { name: client.name, projectIds: client.projectIds, hourlyRate: client.hourlyRate, profitFactor: client.profitFactor, active: client.active } : EMPTY)
    }, [open, client, form])

    return (
        <Dialog open={open} onOpenChange={(next) => !next && !submitting && onClose()}>
            <DialogContent className="sm:max-w-2xl">
                <form
                    className="space-y-5"
                    onSubmit={(event) => {
                        event.stopPropagation()
                        void form.handleSubmit(async (values) => {
                            const result = await onSubmit(values)
                            if (result) onClose()
                        })(event)
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>{client ? `Editar ${client.name}` : "Novo cliente"}</DialogTitle>
                        <DialogDescription>O cliente vê no portal apenas as tarefas dos repositórios escolhidos. O token de acesso é gerado ao salvar.</DialogDescription>
                    </DialogHeader>

                    <Field id="client-name" label="Nome" error={errors.name?.message}>
                        <Input id="client-name" autoFocus placeholder="Ex.: Cliente X" {...form.register("name")} aria-invalid={errors.name ? true : undefined} />
                    </Field>

                    <Field id="client-repos" label="Repositórios" error={errors.projectIds?.message}>
                        <Controller
                            control={form.control}
                            name="projectIds"
                            render={({ field }) => (
                                <CadastroMultiSelect
                                    id="client-repos"
                                    icon={Github}
                                    placeholder={reposPlaceholder}
                                    options={repoOptions}
                                    renderLabel={(option) => {
                                        const project = projectById.get(option.value)
                                        return project ? <GithubRepoLabel repo={repoLabelOption(project.repo, repoIndex)} /> : option.label
                                    }}
                                    selected={field.value}
                                    onSelect={field.onChange}
                                    searchable
                                    searchPlaceholder="Buscar repositório..."
                                />
                            )}
                        />
                    </Field>

                    <div className={FORM_GRID}>
                        <Field id="client-hourly-rate" label="Custo por hora" error={errors.hourlyRate?.message}>
                            <Controller control={form.control} name="hourlyRate" render={({ field }) => <MoneyInput id="client-hourly-rate" value={field.value} onChange={field.onChange} />} />
                        </Field>
                        <Field id="client-profit-factor" label="Fator de lucro" error={errors.profitFactor?.message}>
                            <Controller
                                control={form.control}
                                name="profitFactor"
                                render={({ field }) => (
                                    <Input
                                        id="client-profit-factor"
                                        type="number"
                                        min={1}
                                        step={0.5}
                                        inputMode="decimal"
                                        value={Number.isFinite(field.value) ? field.value : ""}
                                        onChange={(event) => field.onChange(event.target.value === "" ? 0 : Number(event.target.value))}
                                    />
                                )}
                            />
                        </Field>
                        <div className="col-span-full">
                            <FormToggleCard<ClienteOrcamentoInput> control={form.control} name="active" id="client-active" label="Cliente ativo" description="Desligado, o token deixa de dar acesso ao portal." />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={submitting || !form.formState.isValid || projectIds.length === 0}>
                            {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                            {client ? "Salvar" : "Criar cliente"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
