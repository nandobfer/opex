"use client"

import { useEffect } from "react"
import { Controller, useForm, type Control } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { DEFAULT_ENVIRONMENTS_SETTINGS, environmentsSettingsSchema, type EnvironmentsSettings } from "../schemas"
import { useEnvironmentsSettings, useRegistryStatus, useSaveEnvironmentsSettings } from "../hooks/useEnvironments"

const numberField = (name: "registryPort" | "keepTags", id: string, control: Control<EnvironmentsSettings>) => (
    <Controller control={control} name={name} render={({ field }) => <Input id={id} type="number" value={Number.isNaN(field.value) ? "" : field.value} onChange={(event) => field.onChange(event.target.value === "" ? Number.NaN : Number(event.target.value))} />} />
)

/** Configurações (engrenagem): pasta base no servidor, porta do registry e quantas tags manter. */
export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const query = useEnvironmentsSettings(open)
    const registry = useRegistryStatus(open)
    const save = useSaveEnvironmentsSettings()
    const form = useForm<EnvironmentsSettings>({ resolver: zodResolver(environmentsSettingsSchema), mode: "onChange", defaultValues: DEFAULT_ENVIRONMENTS_SETTINGS })
    useEffect(() => {
        if (query.data) form.reset(query.data.settings)
    }, [query.data, form])
    const errors = form.formState.errors
    const submit = form.handleSubmit((values) => save.mutate(values, { onSuccess: onClose }))
    return (
        <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
            <DialogContent>
                <form onSubmit={(event) => void submit(event)} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>Configurações dos ambientes</DialogTitle>
                        <DialogDescription>A conexão com o PC é a da integração Builder Machine. Registry: {registry.data?.detail ?? "conferindo…"}.</DialogDescription>
                    </DialogHeader>
                    <div className={FORM_GRID}>
                        <Field id="environments-base-dir" label="Pasta base no servidor (relativa ao $HOME)" error={errors.baseDir?.message}>
                            <Input id="environments-base-dir" className="font-mono" {...form.register("baseDir")} />
                        </Field>
                        <Field id="environments-registry-port" label="Porta do registry (127.0.0.1)" error={errors.registryPort?.message}>
                            {numberField("registryPort", "environments-registry-port", form.control)}
                        </Field>
                        <Field id="environments-keep-tags" label="Tags mantidas por ambiente" error={errors.keepTags?.message}>
                            {numberField("keepTags", "environments-keep-tags", form.control)}
                        </Field>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={save.isPending || !form.formState.isValid}>
                            Salvar
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
