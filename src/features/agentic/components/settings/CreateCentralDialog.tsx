"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowRight, FolderGit2, Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { Input } from "@/components/ui/input"
import { SearchPicker } from "@/components/ui/search-picker"
import { apiErrorMessage } from "@/lib/api"
import { GithubRepoLabel } from "@/features/github/components/shared"
import { repoLabelOption } from "@/features/github/components/RepoIndexProvider"
import { useGithubRepoIndex } from "@/features/github/hooks/useGithub"
import { useTaskOptions } from "@/features/tasks/hooks/useTasks"
import type { ProjectRef } from "@/features/tasks/types"
import { projectBootstrapNewPath } from "@/features/project-bootstrap/constants"
import { parseRepoInput } from "@/features/project-bootstrap/repo-name"
import { centralSettingsPath, AGENTIC_CODE_ROOT } from "../../constants"
import { useCreateCentral } from "../../hooks/useAgentic"
import { defaultSessionDirectory } from "../../logic"
import { createCentralSchema, type CreateCentralInput } from "../../schemas"
import type { CentralDto } from "../../types"

interface CreateCentralDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    existing: readonly CentralDto[]
}

const EMPTY: CreateCentralInput = { projectId: "", projectName: "", sessionDirectory: "" }

/**
 * Nova central: projeto (repositório vinculado, um por central) + diretório das sessões. Um nome que não
 * está na lista ("Criar repositório «nome»") leva ao bootstrap de um ambiente novo (OPE-215).
 */
export function CreateCentralDialog({ open, onOpenChange, existing }: CreateCentralDialogProps) {
    const router = useRouter()
    const options = useTaskOptions(open)
    const repoIndex = useGithubRepoIndex(open)
    const create = useCreateCentral()
    const form = useForm<CreateCentralInput>({ resolver: zodResolver(createCentralSchema), mode: "onChange", defaultValues: EMPTY })
    const projectId = useWatch({ control: form.control, name: "projectId" })
    const errors = form.formState.errors
    const taken = useMemo(() => new Set(existing.map((central) => central.projectId)), [existing])
    const projects = useMemo(() => options.data?.projects ?? [], [options.data])
    const project = useMemo(() => projects.find((item) => item.id === projectId) ?? null, [projects, projectId])
    const [newRepo, setNewRepo] = useState<string | null>(null)
    const [wasOpen, setWasOpen] = useState(open)
    const knownRepos = useMemo(() => new Set(projects.map((item) => item.repo.toLowerCase())), [projects])
    // Reabrir o diálogo descarta o nome novo da vez anterior.
    if (wasOpen !== open) {
        setWasOpen(open)
        if (open) setNewRepo(null)
    }

    useEffect(() => {
        if (open) form.reset(EMPTY)
    }, [open, form])

    const submit = form.handleSubmit(async (values) => {
        if (newRepo) return
        const central = await create.mutateAsync(values).catch(() => null)
        if (!central) return
        onOpenChange(false)
        router.push(centralSettingsPath(central.id))
    })

    return (
        <Dialog open={open} onOpenChange={(next) => !create.isPending && onOpenChange(next)}>
            <DialogContent className="sm:max-w-lg">
                <form
                    className="space-y-5"
                    onSubmit={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        void submit()
                    }}
                >
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FolderGit2 className="h-4 w-4 text-primary" aria-hidden /> Nova central de desenvolvimento
                        </DialogTitle>
                        <DialogDescription>Escolha o projeto (repositório vinculado) e o diretório dele na máquina do OpenCode, ou digite um nome novo para criar o repositório e provisionar o ambiente do zero. O resto você ajusta depois, nas configurações da central.</DialogDescription>
                    </DialogHeader>

                    <Field id="central-product" label="Projeto (repositório)" error={errors.projectId?.message ?? (options.isError ? apiErrorMessage(options.error, "Não foi possível listar os projetos") : undefined)}>
                        <SearchPicker<ProjectRef>
                            trigger={
                                <FieldTrigger
                                    id="central-product"
                                    placeholder="Escolha o repositório ou digite um nome novo"
                                    value={
                                        newRepo ? (
                                            <span className="flex min-w-0 items-center gap-2">
                                                <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                                                <span className="truncate font-mono">{newRepo}</span>
                                                <span className="shrink-0 rounded bg-primary/15 px-1.5 text-[10px] font-medium text-primary">novo</span>
                                            </span>
                                        ) : project ? (
                                            <GithubRepoLabel repo={repoLabelOption(project.repo, repoIndex)} />
                                        ) : undefined
                                    }
                                    invalid={Boolean(errors.projectId) && !newRepo}
                                />
                            }
                            items={projects}
                            getKey={(item) => item.id}
                            searchKeys={["repo", "name", "sigla"]}
                            renderItem={(item) => <GithubRepoLabel repo={repoLabelOption(item.repo, repoIndex)} />}
                            disabledReason={(item) => (taken.has(item.id) ? "Este projeto já tem uma central" : false)}
                            onPick={(item) => {
                                setNewRepo(null)
                                form.setValue("projectId", item.id, { shouldDirty: true, shouldValidate: true })
                                form.setValue("projectName", item.name, { shouldDirty: true, shouldValidate: true })
                                form.setValue("sessionDirectory", defaultSessionDirectory(AGENTIC_CODE_ROOT, item.name), { shouldDirty: true, shouldValidate: true })
                            }}
                            loading={options.isLoading}
                            matchTriggerWidth
                            placeholder="Buscar repositório"
                            searchLabel="Buscar repositório"
                            listLabel="Repositórios vinculados"
                            emptyText={options.isError ? "Não foi possível listar os repositórios (confira o token em Integrações › GitHub)" : "Nenhum repositório vinculado: vincule um em Integrações › GitHub"}
                            emptySearchText="Nenhum repositório encontrado"
                            createOption={{
                                label: (term) => (
                                    <>
                                        Criar repositório <span className="font-mono">«{parseRepoInput(term).owner ? `${parseRepoInput(term).owner}/` : ""}{parseRepoInput(term).name}»</span> e provisionar o ambiente
                                    </>
                                ),
                                visible: (term) => Boolean(parseRepoInput(term).name) && !knownRepos.has(term.trim().toLowerCase()),
                                onCreate: (term) => {
                                    const parsed = parseRepoInput(term)
                                    setNewRepo(parsed.owner ? `${parsed.owner}/${parsed.name}` : parsed.name)
                                    form.reset(EMPTY)
                                },
                            }}
                            footer={
                                options.isError ? (
                                    <button type="button" className="w-full rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted" onClick={() => void options.refetch()}>
                                        Tentar novamente
                                    </button>
                                ) : undefined
                            }
                        />
                    </Field>

                    {newRepo ? (
                        <p className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-muted-foreground">
                            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                            <span>
                                <span className="font-mono text-foreground">{newRepo}</span> não está vinculado: o assistente de bootstrap cria o repositório, provisiona o ambiente com o Agente de Bootstrap e cria a central e o ambiente no fim.
                            </span>
                        </p>
                    ) : (
                        <>
                            <Field id="central-directory" label="Diretório das sessões" error={errors.sessionDirectory?.message}>
                                <Input id="central-directory" placeholder="/home/usuario/code/meu-projeto" className="font-mono" {...form.register("sessionDirectory")} aria-invalid={errors.sessionDirectory ? true : undefined} />
                            </Field>
                            <p className="-mt-3 text-xs text-muted-foreground">Raiz do repositório (com git e docker compose) onde o planejamento acontece; os worktrees ficam em &lt;diretório&gt;/worktrees.</p>
                        </>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={create.isPending}>
                            Cancelar
                        </Button>
                        {newRepo ? (
                            <Button
                                type="button"
                                className="gap-1.5"
                                onClick={() => {
                                    onOpenChange(false)
                                    router.push(projectBootstrapNewPath(newRepo))
                                }}
                            >
                                Continuar no bootstrap <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                        ) : (
                            <Button type="submit" disabled={create.isPending || !form.formState.isValid}>
                                {create.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                                Criar central
                            </Button>
                        )}
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
