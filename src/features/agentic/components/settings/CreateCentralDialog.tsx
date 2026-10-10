"use client"

import { useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { FolderGit2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { Input } from "@/components/ui/input"
import { SearchPicker } from "@/components/ui/search-picker"
import { apiErrorMessage } from "@/lib/api"
import { useTaskOptions } from "@/features/tasks/hooks/useTasks"
import type { NamedRef } from "@/features/tasks/types"
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

/** Nova central: projeto (repositório vinculado, um por central) + diretório das sessões. */
export function CreateCentralDialog({ open, onOpenChange, existing }: CreateCentralDialogProps) {
    const router = useRouter()
    const options = useTaskOptions(open)
    const create = useCreateCentral()
    const form = useForm<CreateCentralInput>({ resolver: zodResolver(createCentralSchema), mode: "onChange", defaultValues: EMPTY })
    const projectName = useWatch({ control: form.control, name: "projectName" })
    const errors = form.formState.errors
    const taken = useMemo(() => new Set(existing.map((central) => central.projectId)), [existing])

    useEffect(() => {
        if (open) form.reset(EMPTY)
    }, [open, form])

    const submit = form.handleSubmit(async (values) => {
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
                        <DialogDescription>Escolha o projeto (repositório vinculado) e o diretório dele na máquina do OpenCode. O resto você ajusta depois, nas configurações da central.</DialogDescription>
                    </DialogHeader>

                    <Field id="central-product" label="Projeto (repositório)" error={errors.projectId?.message ?? (options.isError ? apiErrorMessage(options.error, "Não foi possível listar os projetos") : undefined)}>
                        <SearchPicker<NamedRef>
                            trigger={<FieldTrigger id="central-product" placeholder="Escolha o projeto" value={projectName || undefined} invalid={Boolean(errors.projectId)} />}
                            items={options.data?.projects ?? []}
                            getKey={(item) => item.id}
                            searchKeys={["name"]}
                            renderItem={(item) => <span className="truncate">{item.name}</span>}
                            disabledReason={(item) => (taken.has(item.id) ? "Este projeto já tem uma central" : false)}
                            onPick={(item) => {
                                form.setValue("projectId", item.id, { shouldDirty: true, shouldValidate: true })
                                form.setValue("projectName", item.name, { shouldDirty: true, shouldValidate: true })
                                form.setValue("sessionDirectory", defaultSessionDirectory(AGENTIC_CODE_ROOT, item.name), { shouldDirty: true, shouldValidate: true })
                            }}
                            loading={options.isLoading}
                            matchTriggerWidth
                            placeholder="Buscar projeto"
                            searchLabel="Buscar projeto"
                            listLabel="Projetos"
                            emptyText="Nenhum projeto disponível (vincule um repositório em Integrações › GitHub)"
                            emptySearchText="Nenhum projeto encontrado"
                        />
                    </Field>

                    <Field id="central-directory" label="Diretório das sessões" error={errors.sessionDirectory?.message}>
                        <Input id="central-directory" placeholder="/home/usuario/code/meu-projeto" className="font-mono" {...form.register("sessionDirectory")} aria-invalid={errors.sessionDirectory ? true : undefined} />
                    </Field>
                    <p className="-mt-3 text-xs text-muted-foreground">Raiz do repositório (com git e docker compose) onde o planejamento acontece; os worktrees ficam em &lt;diretório&gt;/worktrees.</p>

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={create.isPending}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={create.isPending || !form.formState.isValid}>
                            {create.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                            Criar central
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
