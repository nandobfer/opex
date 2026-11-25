"use client"

import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { AnimatePresence, motion } from "framer-motion"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { OptionTabs, type OptionTabsOption } from "@/components/ui/option-tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { useCentrals } from "@/features/agentic/hooks/useAgentic"
import type { EnvironmentInput } from "../schemas"
import { SOURCE_KIND_LABELS, sourceDefaults, slugify, type CreatableSourceKind } from "../view"
import { ComposeEditorField } from "./ComposeEditorField"

/** Lista separada por vírgula (campo de texto) ⇄ array. */
export const textToList = (text: string) => text.split(",").map((item) => item.trim()).filter(Boolean)
export const listToText = (items: string[]) => items.join(", ")

type Form = UseFormReturn<EnvironmentInput>
type Kind = EnvironmentInput["source"]["kind"]

const ADOPTED_HINT = "Adote um projeto em execução pela lista Não gerenciados"

/** Seletor de origem: Central e Compose gerenciado na criação; o adotado vem de "Adotar". Travado ao editar. */
function kindOptions(editing: boolean): OptionTabsOption<Kind>[] {
    return (["central", "managed", "adopted"] as const).map((kind) => ({
        value: kind,
        label: SOURCE_KIND_LABELS[kind],
        title: kind === "adopted" && !editing ? ADOPTED_HINT : SOURCE_KIND_LABELS[kind],
        disabled: editing || kind === "adopted",
    }))
}

/** Nome do projeto e serviços (central e compose gerenciado). */
function ProjectFields({ form }: { form: Form }) {
    const errors = form.formState.errors.source as Record<string, { message?: string }> | undefined
    return (
        <>
            <Field id="environment-project" label="Nome do projeto do compose" error={errors?.projectName?.message}>
                <Input id="environment-project" className="font-mono" {...form.register("source.projectName")} />
            </Field>
            <Field id="environment-services" label="Serviços (vazio = todos)" error={errors?.services?.message}>
                <Controller control={form.control} name="source.services" render={({ field }) => <Input id="environment-services" className="font-mono" value={listToText((field.value as string[] | undefined) ?? [])} onChange={(event) => field.onChange(textToList(event.target.value))} placeholder="app, worker" />} />
            </Field>
        </>
    )
}

function CentralFields({ form, editing }: { form: Form; editing: boolean }) {
    const centrals = useCentrals(true)
    const errors = form.formState.errors.source as Record<string, { message?: string }> | undefined
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
            <ProjectFields form={form} />
        </div>
    )
}

/** Compose gerenciado: projeto e serviços; na criação, o YAML (vira a v1). Depois, pelo botão Compose. */
function ManagedFields({ form, editing }: { form: Form; editing: boolean }) {
    return (
        <div className="space-y-4">
            <div className={FORM_GRID}>
                <ProjectFields form={form} />
            </div>
            {editing ? (
                <p className="text-xs text-muted-foreground">O compose se edita pelo botão Compose na lista (cada gravação cria uma revisão).</p>
            ) : (
                <Controller control={form.control} name="compose" render={({ field, fieldState }) => <ComposeEditorField id="environment-compose-yaml" label="docker-compose.yml" value={field.value ?? ""} onChange={field.onChange} error={fieldState.error?.message} />} />
            )}
        </div>
    )
}

/** Origem: central (ref, compose, serviços, projeto), compose gerenciado (YAML no Opex) ou projeto adotado (só leitura). */
export function SourceFields({ form, editing }: { form: Form; editing: boolean }) {
    const source = useWatch({ control: form.control, name: "source" })
    const kind = source?.kind ?? "central"
    const changeKind = (next: Kind) => {
        if (next === kind || next === "adopted") return
        const projectName = slugify(form.getValues("slug") || form.getValues("name") || "")
        form.setValue("source", sourceDefaults(next as CreatableSourceKind, { centralId: "", projectName }), { shouldValidate: true, shouldDirty: true })
        form.setValue("compose", next === "managed" ? "" : undefined)
    }
    return (
        <div className="space-y-4">
            <Field id="environment-source-kind" label="Origem">
                <OptionTabs<Kind> id="environment-source-kind" aria-label="Origem" options={kindOptions(editing)} value={kind} onChange={changeKind} className="w-full" />
            </Field>
            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={kind} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
                    {source?.kind === "adopted" ? (
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
                    ) : kind === "managed" ? (
                        <ManagedFields form={form} editing={editing} />
                    ) : (
                        <CentralFields form={form} editing={editing} />
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    )
}
