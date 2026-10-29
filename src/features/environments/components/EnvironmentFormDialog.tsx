"use client"

import { useEffect } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { OptionTabs } from "@/components/ui/option-tabs"
import { useSaveEnvironment } from "../hooks/useEnvironments"
import { environmentInputSchema, type EnvironmentInput, type Machine } from "../schemas"
import type { EnvironmentDto } from "../types"
import { formValuesOf, machineOptions, slugify } from "../view"
import { EnvVarsField } from "./EnvVarsField"
import { listToText, SourceFields, textToList } from "./SourceFields"

interface Props {
    open: boolean
    env: EnvironmentDto | null
    pcAvailable: boolean
    pcReason: string | null
    onClose: () => void
}

/** Novo/Editar ambiente (mesmo schema Zod da API). */
export function EnvironmentFormDialog({ open, env, pcAvailable, pcReason, onClose }: Props) {
    const save = useSaveEnvironment(env?.id ?? null)
    const form = useForm<EnvironmentInput>({ resolver: zodResolver(environmentInputSchema), mode: "onChange", defaultValues: formValuesOf(null, { centralId: "", projectName: "" }) })
    useEffect(() => {
        if (open) form.reset(formValuesOf(env, { centralId: "", projectName: "" }))
    }, [open, env, form])
    const errors = form.formState.errors
    const name = useWatch({ control: form.control, name: "name" })
    const options = machineOptions(pcAvailable, pcReason)
    const submit = form.handleSubmit((values) => save.mutate(values, { onSuccess: onClose }))

    return (
        <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
            <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
                <form onSubmit={(event) => void submit(event)} className="space-y-5">
                    <DialogHeader>
                        <DialogTitle>{env ? `Editar ${env.name}` : "Novo ambiente"}</DialogTitle>
                        <DialogDescription>{env ? "Mudanças valem no próximo deploy." : "O ambiente é criado sem implantar; use Deploy na lista."}</DialogDescription>
                    </DialogHeader>
                    <div className={FORM_GRID}>
                        <Field id="environment-name" label="Nome" error={errors.name?.message}>
                            <Input
                                id="environment-name"
                                {...form.register("name", {
                                    onChange: (event: { target: { value: string } }) => {
                                        if (!env && !form.getFieldState("slug").isDirty) form.setValue("slug", slugify(event.target.value), { shouldValidate: true })
                                    },
                                })}
                            />
                        </Field>
                        <Field id="environment-slug" label="Slug" error={errors.slug?.message}>
                            <Input id="environment-slug" className="font-mono" placeholder={slugify(name ?? "")} {...form.register("slug")} />
                        </Field>
                    </div>
                    <SourceFields form={form} editing={Boolean(env)} />
                    <EnvVarsField form={form} editing={Boolean(env)} />
                    <div className={FORM_GRID}>
                        <Field id="environment-ports" label="Portas (separadas por vírgula)" error={errors.ports?.message ?? errors.ports?.find?.((item) => item?.message)?.message}>
                            <Controller control={form.control} name="ports" render={({ field }) => <Input id="environment-ports" className="font-mono" value={listToText(field.value.map(String))} onChange={(event) => field.onChange(textToList(event.target.value).map(Number))} placeholder="4100, 4101" />} />
                        </Field>
                        <Field id="environment-health" label="URL de saúde (opcional)" error={errors.healthUrl?.message}>
                            <Input id="environment-health" className="font-mono" placeholder="http://localhost:4100/api/health" {...form.register("healthUrl")} />
                        </Field>
                        <Field id="environment-build-on" label="Build em" error={errors.buildOn?.message}>
                            <Controller control={form.control} name="buildOn" render={({ field }) => <OptionTabs<Machine> id="environment-build-on" aria-label="Build em" options={options} value={field.value} onChange={field.onChange} className="w-full" />} />
                        </Field>
                        <Field id="environment-run-on" label="Executar em" error={errors.runOn?.message}>
                            <Controller control={form.control} name="runOn" render={({ field }) => <OptionTabs<Machine> id="environment-run-on" aria-label="Executar em" options={options} value={field.value} onChange={field.onChange} className="w-full" />} />
                        </Field>
                    </div>
                    {!pcAvailable && <p className="text-xs text-muted-foreground">PC indisponível: {pcReason ?? "túnel fechado"}.</p>}
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={save.isPending}>
                            {env ? "Salvar" : "Criar ambiente"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
