"use client"

import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { useCentrals } from "@/features/agentic/hooks/useAgentic"
import type { EnvironmentInput } from "../schemas"

/** Lista separada por vírgula (campo de texto) ⇄ array. */
export const textToList = (text: string) => text.split(",").map((item) => item.trim()).filter(Boolean)
export const listToText = (items: string[]) => items.join(", ")

type Form = UseFormReturn<EnvironmentInput>

/** Origem: repositório de uma central (ref, compose, serviços, projeto) ou projeto adotado (só leitura). */
export function SourceFields({ form, editing }: { form: Form; editing: boolean }) {
    const source = useWatch({ control: form.control, name: "source" })
    const centrals = useCentrals(source?.kind === "central")
    const errors = form.formState.errors.source as Record<string, { message?: string }> | undefined
    if (source?.kind === "adopted")
        return (
            <div className="space-y-3 rounded-md border p-3 text-sm">
                <p>
                    Projeto adotado <span className="font-mono">{source.projectName}</span> no {source.machine === "pc" ? "PC" : "servidor"}, em <span className="font-mono">{source.workingDir}</span>.
                </p>
                {source.git ? (
                    <FormToggleCard<EnvironmentInput> control={form.control} name="source.pullOnRedeploy" id="environment-pull" label="git pull no redeploy" description="Atualiza a pasta (fast-forward) antes do build" onLabel="Sim" offLabel="Não" />
                ) : (
                    <p className="text-xs text-muted-foreground">Pasta sem git: o redeploy só refaz o build.</p>
                )}
            </div>
        )
    return (
        <div className={FORM_GRID}>
            <Field id="environment-central" label="Central (repositório)" error={errors?.centralId?.message}>
                <Controller
                    control={form.control}
                    name="source.centralId"
                    render={({ field }) => (
                        <Select value={field.value || undefined} onValueChange={field.onChange} disabled={editing}>
                            <SelectTrigger id="environment-central" className="w-full">
                                <SelectValue placeholder={centrals.isLoading ? "Carregando…" : "Escolha a central"} />
                            </SelectTrigger>
                            <SelectContent>
                                {(centrals.data ?? []).map((central) => (
                                    <SelectItem key={central.id} value={central.id}>
                                        {central.projectName}
                                        {central.repo ? ` (${central.repo})` : ""}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                />
            </Field>
            <Field id="environment-ref" label="Ref (branch, tag ou commit)" error={errors?.ref?.message}>
                <Input id="environment-ref" className="font-mono" {...form.register("source.ref")} />
            </Field>
            <Field id="environment-compose" label="Arquivo compose" error={errors?.composeFile?.message}>
                <Input id="environment-compose" className="font-mono" {...form.register("source.composeFile")} />
            </Field>
            <Field id="environment-project" label="Nome do projeto do compose" error={errors?.projectName?.message}>
                <Input id="environment-project" className="font-mono" {...form.register("source.projectName")} />
            </Field>
            <Field id="environment-services" label="Serviços (vazio = todos)" error={errors?.services?.message}>
                <Controller control={form.control} name="source.services" render={({ field }) => <Input id="environment-services" className="font-mono" value={listToText((field.value as string[] | undefined) ?? [])} onChange={(event) => field.onChange(textToList(event.target.value))} placeholder="app, worker" />} />
            </Field>
        </div>
    )
}
