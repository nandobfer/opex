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
import { centralSettingsPath } from "../../constants"
import { useCreateCentral } from "../../hooks/useAgentic"
import { createCentralSchema, type CreateCentralInput } from "../../schemas"
import type { CentralDto } from "../../types"

interface CreateCentralDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    existing: readonly CentralDto[]
}

const EMPTY: CreateCentralInput = { productId: "", productName: "", sessionDirectory: "" }

/** Nova central: produto do Go! Sipal (um por central) + diretório das sessões. */
export function CreateCentralDialog({ open, onOpenChange, existing }: CreateCentralDialogProps) {
    const router = useRouter()
    const options = useTaskOptions(open)
    const create = useCreateCentral()
    const form = useForm<CreateCentralInput>({ resolver: zodResolver(createCentralSchema), mode: "onChange", defaultValues: EMPTY })
    const productName = useWatch({ control: form.control, name: "productName" })
    const errors = form.formState.errors
    const taken = useMemo(() => new Set(existing.map((central) => central.productId)), [existing])

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
                        <DialogDescription>Escolha o produto e o diretório do repositório dele na máquina do OpenCode. O resto você ajusta depois, nas configurações da central.</DialogDescription>
                    </DialogHeader>

                    <Field id="central-product" label="Produto do Go! Sipal" error={errors.productId?.message ?? (options.isError ? apiErrorMessage(options.error, "Não foi possível listar os produtos") : undefined)}>
                        <SearchPicker<NamedRef>
                            trigger={<FieldTrigger id="central-product" placeholder="Escolha o produto" value={productName || undefined} invalid={Boolean(errors.productId)} />}
                            items={options.data?.products ?? []}
                            getKey={(item) => item.id}
                            searchKeys={["name"]}
                            renderItem={(item) => <span className="truncate">{item.name}</span>}
                            disabledReason={(item) => (taken.has(item.id) ? "Este produto já tem uma central" : false)}
                            onPick={(item) => {
                                form.setValue("productId", item.id, { shouldDirty: true, shouldValidate: true })
                                form.setValue("productName", item.name, { shouldDirty: true, shouldValidate: true })
                            }}
                            loading={options.isLoading}
                            matchTriggerWidth
                            placeholder="Buscar produto"
                            searchLabel="Buscar produto"
                            listLabel="Produtos"
                            emptyText="Nenhum produto disponível"
                            emptySearchText="Nenhum produto encontrado"
                        />
                    </Field>

                    <Field id="central-directory" label="Diretório das sessões" error={errors.sessionDirectory?.message}>
                        <Input id="central-directory" placeholder="/home/usuario/code/meu-projeto" className="font-mono" {...form.register("sessionDirectory")} aria-invalid={errors.sessionDirectory ? true : undefined} />
                    </Field>
                    <p className="-mt-3 text-xs text-muted-foreground">Raiz do repositório (com git e docker compose) onde o planejamento acontece; os worktrees ficam numa pasta irmã.</p>

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
