"use client"

import { useEffect, useRef } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { OptionTabs } from "@/components/ui/option-tabs"
import { useEnvironmentEnvValues, useSaveEnvironment } from "../hooks/useEnvironments"
import { environmentCreateSchema, environmentInputSchema, type EnvironmentInput, type Machine } from "../schemas"
import type { EnvironmentDto, HostCapacityDto } from "../types"
import { formValuesOf, machineOptions, slugify } from "../view"
import { EnvironmentLimitsField } from "./EnvironmentLimitsField"
import { EnvVarsField, type EnvValuesStatus } from "./EnvVarsField"
import { listToText, SourceFields, textToList } from "./SourceFields"

interface Props {
    open: boolean
    env: EnvironmentDto | null
    pcAvailable: boolean
    pcReason: string | null
    /** CPUs e memória de cada máquina (ajuda dos limites). */
    hosts: Record<Machine, HostCapacityDto | null>
    onClose: () => void
}

export const NO_HOSTS: Record<Machine, HostCapacityDto | null> = { server: null, pc: null }
const MACHINE_SUBJECT: Record<Machine, string> = { server: "o servidor", pc: "o PC" }
const createResolver = zodResolver(environmentCreateSchema)
const editResolver = zodResolver(environmentInputSchema)

/** Novo/Editar ambiente (mesmos schemas Zod da API: criação exige o compose do gerenciado). */
export function EnvironmentFormDialog({ open, env, pcAvailable, pcReason, hosts, onClose }: Props) {
    const save = useSaveEnvironment(env?.id ?? null)
    const editing = useRef(Boolean(env))
    useEffect(() => {
        editing.current = Boolean(env)
    }, [env])
    const form = useForm<EnvironmentInput>({ resolver: (values, context, options) => (editing.current ? editResolver : createResolver)(values, context, options), mode: "onChange", defaultValues: formValuesOf(null, { centralId: "", projectName: "" }) })
    // Editar: os valores das variáveis são lidos à parte (a cada abertura) e entram na lista uma vez.
    const envValues = useEnvironmentEnvValues(env?.id ?? null, open)
    const appliedValues = useRef(false)
    useEffect(() => {
        appliedValues.current = false
        if (open) form.reset(formValuesOf(env, { centralId: "", projectName: "" }))
    }, [open, env, form])
    const freshValues = envValues.data && !envValues.isFetching ? envValues.data : null
    useEffect(() => {
        if (!open || !env || !freshValues || appliedValues.current) return
        appliedValues.current = true
        form.setValue("env", formValuesOf(env, { centralId: "", projectName: "" }, freshValues).env, { shouldValidate: true })
    }, [open, env, freshValues, form])
    const envStatus: EnvValuesStatus = !env ? "ready" : envValues.isError && !envValues.isFetching ? "error" : freshValues ? "ready" : "loading"
    const errors = form.formState.errors
    const name = useWatch({ control: form.control, name: "name" })
    const runOn = useWatch({ control: form.control, name: "runOn" }) ?? "server"
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
                    <EnvVarsField form={form} status={envStatus} onRetry={() => void envValues.refetch()} />
                    <EnvironmentLimitsField form={form} env={env} host={hosts[runOn]} machine={MACHINE_SUBJECT[runOn]} />
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
                        <Button type="submit" disabled={save.isPending || envStatus !== "ready"}>
                            {env ? "Salvar" : "Criar ambiente"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
