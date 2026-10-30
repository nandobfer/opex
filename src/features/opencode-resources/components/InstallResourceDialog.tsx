"use client"

import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ChipInput } from "@/components/ui/chip-input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { InstallableKind } from "../constants"
import { installFormSchema, type InstallFormValues } from "../form-schemas"
import { useInstallOpencodeResource } from "../hooks/useOpencodeResources"
import { KIND_UI } from "./kind-ui"

const NOTES: Record<InstallableKind, string> = {
    skill: "Usa a CLI skills (npx skills add) na máquina do OpenCode. Sem nomes, instala todas as skills do repositório.",
    plugin: "O pacote entra na configuração e é baixado pelo OpenCode ao carregar: reinicie o serviço (aba Controles) para aplicar.",
    mcp: "Pacote npm: a versão mais recente fica fixada no comando (npx -y pacote@versão), para acompanhar atualizações.",
}

/** Instalar skill (repositório), plugin ou MCP (pacote). Executa código de terceiros no host. */
export function InstallResourceDialog({ kind, scope, open, onClose }: { kind: InstallableKind; scope: string; open: boolean; onClose: () => void }) {
    const ui = KIND_UI[kind]
    const install = useInstallOpencodeResource(kind)
    const form = useForm<InstallFormValues>({ resolver: zodResolver(installFormSchema), mode: "onChange", defaultValues: { source: "", skills: [], name: "" } })
    const errors = form.formState.errors
    const close = () => {
        if (install.isPending) return
        form.reset()
        onClose()
    }
    const submit = (values: InstallFormValues) =>
        install.mutate({ kind, scope, source: values.source, skills: kind === "skill" && values.skills.length ? values.skills : undefined, name: kind === "mcp" && values.name ? values.name : undefined }, { onSuccess: close })

    return (
        <Dialog open={open} onOpenChange={(next) => !next && close()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{ui.installLabel}</DialogTitle>
                    <DialogDescription>{NOTES[kind]} Um backup da configuração é feito antes.</DialogDescription>
                </DialogHeader>
                <form className="space-y-4" onSubmit={form.handleSubmit(submit)} noValidate>
                    <Field id="install-source" label={ui.installSourceLabel} error={errors.source?.message}>
                        <Input id="install-source" className="font-mono" placeholder={ui.installSourcePlaceholder} autoFocus {...form.register("source")} />
                    </Field>
                    {kind === "skill" ? (
                        <Field id="install-skills" label="Skills do repositório (opcional)" error={errors.skills?.message}>
                            <Controller control={form.control} name="skills" render={({ field }) => <ChipInput id="install-skills" value={field.value} onChange={field.onChange} placeholder="nome-da-skill e Enter" />} />
                        </Field>
                    ) : null}
                    {kind === "mcp" ? (
                        <Field id="install-name" label="Nome do MCP (opcional)" error={errors.name?.message}>
                            <Input id="install-name" className="font-mono" placeholder="derivado do pacote" {...form.register("name")} />
                        </Field>
                    ) : null}
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" onClick={close} disabled={install.isPending}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={install.isPending || !form.formState.isValid}>
                            {install.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
                            {install.isPending ? "Instalando…" : "Instalar"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
