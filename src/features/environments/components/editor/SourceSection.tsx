"use client"

import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { AnimatePresence, motion } from "framer-motion"
import { FileCode, Lock, Plus } from "lucide-react"
import { FormSection } from "@/components/form-page/FormSection"
import { Button } from "@/components/ui/button"
import { ChipInput } from "@/components/ui/chip-input"
import { Field } from "@/components/ui/field"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { OptionTabs, type OptionTabsOption } from "@/components/ui/option-tabs"
import { SearchPicker } from "@/components/ui/search-picker"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { useCentrals } from "@/features/agentic/hooks/useAgentic"
import { sectionAnchor } from "../../editor-sections"
import { useComposeRead } from "../../hooks/useFormComposeRead"
import type { EnvironmentDto } from "../../types"
import type { EnvironmentInput } from "../../schemas"
import { SOURCE_KIND_LABELS, sourceDefaults, slugify, type CreatableSourceKind } from "../../view"
import { ComposeEditorField } from "../ComposeEditorField"

type Form = UseFormReturn<EnvironmentInput>
type Kind = EnvironmentInput["source"]["kind"]
type SourceErrors = Record<string, { message?: string } | undefined> | undefined

const ADOPTED_HINT = "Adote um projeto em execução pela lista Não gerenciados"

/** Tipo da origem: Central e Compose gerenciado no Novo; o adotado vem de "Adotar". Travado no Editar. */
function kindOptions(editing: boolean): OptionTabsOption<Kind>[] {
    return (["central", "managed", "adopted"] as const).map((kind) => ({
        value: kind,
        label: SOURCE_KIND_LABELS[kind],
        title: kind === "adopted" && !editing ? ADOPTED_HINT : SOURCE_KIND_LABELS[kind],
        disabled: editing || kind === "adopted",
    }))
}

/** Serviços do ambiente: chips (vazio = todos) e os do compose lido como atalho. */
function ServicesField({ form }: { form: Form }) {
    const read = useComposeRead()
    const errors = form.formState.errors.source as SourceErrors
    return (
        <Field id="environment-services" label="Serviços do ambiente" error={errors?.services?.message}>
            <Controller
                control={form.control}
                name="source.services"
                render={({ field }) => {
                    const chosen = (field.value as string[] | undefined) ?? []
                    const available = (read.names ?? []).filter((name) => !chosen.includes(name))
                    return (
                        <div className="space-y-2">
                            <ChipInput
                                id="environment-services"
                                aria-label="Serviços do ambiente"
                                value={chosen}
                                onChange={field.onChange}
                                placeholder={chosen.length ? "Outro serviço" : "Todos os serviços do compose"}
                                suggestions={(read.names ?? []).map((name) => ({ value: name, label: name }))}
                            />
                            {available.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                                    <span>Do compose:</span>
                                    {available.map((name) => (
                                        <Button key={name} type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 font-mono text-xs" aria-label={`Incluir o serviço ${name}`} onClick={() => field.onChange([...chosen, name])}>
                                            <Plus className="h-3 w-3" aria-hidden /> {name}
                                        </Button>
                                    ))}
                                </div>
                            )}
                            <p className="text-xs text-muted-foreground">{chosen.length ? `Só ${chosen.join(", ")} sobe(m) no ambiente.` : "Vazio = todos os serviços do compose sobem."}</p>
                        </div>
                    )
                }}
            />
        </Field>
    )
}

function ProjectNameField({ form }: { form: Form }) {
    const errors = form.formState.errors.source as SourceErrors
    return (
        <Field id="environment-project" label="Nome do projeto do compose" error={errors?.projectName?.message}>
            <Input id="environment-project" aria-invalid={errors?.projectName ? true : undefined} className="font-mono" {...form.register("source.projectName")} />
        </Field>
    )
}

/** Central: escolhida pela busca (nome e repositório), ref, arquivo do compose, projeto e serviços. */
function CentralFields({ form, editing }: { form: Form; editing: boolean }) {
    const centrals = useCentrals(true)
    const errors = form.formState.errors.source as SourceErrors
    const items = centrals.data ?? []
    return (
        <div className={FORM_GRID}>
            <Field id="environment-central" label="Central (repositório)" error={errors?.centralId?.message}>
                <Controller
                    control={form.control}
                    name="source.centralId"
                    render={({ field }) => {
                        const selected = items.find((central) => central.id === field.value)
                        return (
                            <SearchPicker
                                trigger={
                                    <FieldTrigger
                                        id="environment-central"
                                        disabled={editing}
                                        invalid={Boolean(errors?.centralId)}
                                        placeholder={centrals.isLoading ? "Carregando…" : "Escolha a central"}
                                        value={selected ? `${selected.projectName}${selected.repo ? ` (${selected.repo})` : ""}` : undefined}
                                    />
                                }
                                items={items}
                                loading={centrals.isLoading}
                                disabled={editing}
                                getKey={(central) => central.id}
                                searchKeys={["projectName", "repo"]}
                                renderItem={(central) => (
                                    <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                                        <span className="truncate text-sm">{central.projectName}</span>
                                        {central.repo && <span className="shrink-0 font-mono text-xs text-muted-foreground">{central.repo}</span>}
                                    </span>
                                )}
                                onPick={(central) => field.onChange(central.id)}
                                matchTriggerWidth
                                searchLabel="Buscar central"
                                listLabel="Centrais"
                                emptyText="Nenhuma central configurada"
                                emptySearchText="Nenhuma central encontrada"
                            />
                        )
                    }}
                />
            </Field>
            <Field id="environment-ref" label="Ref (branch, tag ou commit)" error={errors?.ref?.message}>
                <Input id="environment-ref" aria-invalid={errors?.ref ? true : undefined} className="font-mono" placeholder="main" {...form.register("source.ref")} />
            </Field>
            <Field id="environment-compose" label="Arquivo do compose" error={errors?.composeFile?.message}>
                <Input id="environment-compose" aria-invalid={errors?.composeFile ? true : undefined} className="font-mono" placeholder="docker-compose.yml" {...form.register("source.composeFile")} />
            </Field>
            <ProjectNameField form={form} />
            <div className="sm:col-span-2">
                <ServicesField form={form} />
            </div>
        </div>
    )
}

/** Compose gerenciado: no Novo, o YAML (vira a v1); no Editar, as revisões pelo diálogo Compose. */
function ManagedFields({ form, env, onOpenCompose }: { form: Form; env: EnvironmentDto | null; onOpenCompose: () => void }) {
    const version = env?.source.kind === "managed" ? env.source.composeVersion : null
    return (
        <div className="space-y-4">
            <div className={FORM_GRID}>
                <ProjectNameField form={form} />
                <ServicesField form={form} />
            </div>
            {env ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm">
                    <span className="flex items-center gap-2">
                        <FileCode className="h-4 w-4 text-muted-foreground" aria-hidden /> Compose v{version}: cada gravação cria uma revisão.
                    </span>
                    <Button type="button" variant="outline" size="sm" onClick={onOpenCompose}>
                        Abrir revisões
                    </Button>
                </div>
            ) : (
                <Controller
                    control={form.control}
                    name="compose"
                    render={({ field, fieldState }) => <ComposeEditorField id="environment-compose-yaml" label="docker-compose.yml" value={field.value ?? ""} onChange={field.onChange} error={fieldState.error?.message} />}
                />
            )}
        </div>
    )
}

/** Origem: central (ref, compose, serviços, projeto), compose gerenciado (YAML no Opex) ou projeto adotado. */
export function SourceSection({ form, env, onOpenCompose }: { form: Form; env: EnvironmentDto | null; onOpenCompose: () => void }) {
    const editing = Boolean(env)
    const source = useWatch({ control: form.control, name: "source" })
    const kind = source?.kind ?? "central"
    const changeKind = (next: Kind) => {
        if (next === kind || next === "adopted") return
        const projectName = slugify(form.getValues("slug") || form.getValues("name") || "")
        form.setValue("source", sourceDefaults(next as CreatableSourceKind, { centralId: "", projectName }), { shouldValidate: true, shouldDirty: true })
        form.setValue("compose", next === "managed" ? "" : undefined)
    }
    return (
        <FormSection id={sectionAnchor("origem")} title="Origem" description="De onde vem o compose do ambiente.">
            <Field id="environment-source-kind" label="Tipo">
                <OptionTabs<Kind> id="environment-source-kind" aria-label="Origem" options={kindOptions(editing)} value={kind} onChange={changeKind} className="w-full" />
                {editing && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Lock className="h-3 w-3" aria-hidden /> A origem não muda depois de criada.
                    </p>
                )}
            </Field>
            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={kind} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
                    {source?.kind === "adopted" ? (
                        <div className="space-y-3 rounded-lg border p-4 text-sm">
                            <p>
                                Projeto adotado <span className="font-mono">{source.projectName}</span> no {source.machine === "pc" ? "PC" : "servidor"}, em <span className="font-mono">{source.workingDir}</span>.
                            </p>
                            {source.git ? (
                                <FormToggleCard<EnvironmentInput>
                                    control={form.control}
                                    name="source.pullOnRedeploy"
                                    id="environment-pull"
                                    label="git pull no redeploy"
                                    description="Atualiza a pasta (fast-forward) antes do build"
                                    onLabel="Sim"
                                    offLabel="Não"
                                />
                            ) : (
                                <p className="text-xs text-muted-foreground">Pasta sem git: o redeploy só refaz o build.</p>
                            )}
                        </div>
                    ) : kind === "managed" ? (
                        <ManagedFields form={form} env={env} onOpenCompose={onOpenCompose} />
                    ) : (
                        <CentralFields form={form} editing={editing} />
                    )}
                </motion.div>
            </AnimatePresence>
        </FormSection>
    )
}
