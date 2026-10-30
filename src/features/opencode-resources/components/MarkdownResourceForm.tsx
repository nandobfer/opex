"use client"

import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MarkdownField } from "@/components/ui/markdown-field"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Switch } from "@/components/ui/switch"
import { markdownFormSchema, type MarkdownFormValues } from "../form-schemas"

type MarkdownKind = "skill" | "agent" | "command"

const BODY_LABEL: Record<MarkdownKind, string> = { skill: "Instruções (corpo do SKILL.md)", agent: "Prompt do agente", command: "Template do comando" }
const MODE_OPTIONS = [
    { value: "" as const, label: "Padrão" },
    { value: "primary" as const, label: "Primário" },
    { value: "subagent" as const, label: "Subagente" },
    { value: "all" as const, label: "Ambos" },
]

/**
 * Formulário de skill/agente/comando em arquivo: campos do frontmatter + corpo em Markdown, validados
 * em tempo real pelo mesmo schema da API. Chaves extras do frontmatter são preservadas por quem chama.
 */
export function MarkdownResourceForm({ kind, initial, creating, pending, onSubmit, onCancel }: { kind: MarkdownKind; initial: MarkdownFormValues; creating: boolean; pending: boolean; onSubmit: (values: MarkdownFormValues) => void; onCancel: () => void }) {
    const form = useForm<MarkdownFormValues>({ resolver: zodResolver(markdownFormSchema(kind)), mode: "onChange", defaultValues: initial })
    const errors = form.formState.errors
    return (
        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <div className={FORM_GRID}>
                <Field id="resource-name" label="Nome" error={errors.name?.message}>
                    <Input id="resource-name" {...form.register("name")} disabled={!creating} placeholder="meu-item" className="font-mono" />
                </Field>
                <Field id="resource-description" label={kind === "skill" ? "Descrição (quando usar)" : "Descrição"} error={errors.description?.message}>
                    <Input id="resource-description" {...form.register("description")} placeholder={kind === "skill" ? "Use quando o usuário pedir…" : "Opcional"} />
                </Field>
                {kind !== "skill" ? (
                    <Field id="resource-model" label="Modelo (opcional)" error={errors.model?.message}>
                        <Input id="resource-model" {...form.register("model")} placeholder="provedor/modelo" className="font-mono" />
                    </Field>
                ) : null}
                {kind === "agent" ? (
                    <div className="space-y-1.5">
                        <Label>Modo</Label>
                        <Controller control={form.control} name="mode" render={({ field }) => <OptionTabs options={MODE_OPTIONS} value={field.value} onChange={field.onChange} aria-label="Modo do agente" />} />
                    </div>
                ) : null}
                {kind === "command" ? (
                    <Field id="resource-agent" label="Agente (opcional)" error={errors.agent?.message}>
                        <Input id="resource-agent" {...form.register("agent")} placeholder="build" className="font-mono" />
                    </Field>
                ) : null}
                {kind === "command" ? (
                    <div className="flex items-center gap-2 pt-6">
                        <Controller control={form.control} name="subtask" render={({ field }) => <Switch id="resource-subtask" checked={field.value} onCheckedChange={field.onChange} />} />
                        <Label htmlFor="resource-subtask">Rodar como subtarefa</Label>
                    </div>
                ) : null}
            </div>
            <Field id="resource-body" label={BODY_LABEL[kind]} error={errors.body?.message}>
                <Controller control={form.control} name="body" render={({ field }) => <MarkdownField id="resource-body" value={field.value} onChange={field.onChange} rows={12} invalid={Boolean(errors.body)} ariaLabel={BODY_LABEL[kind]} />} />
            </Field>
            <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
                    Cancelar
                </Button>
                <Button type="submit" disabled={pending || !form.formState.isValid}>
                    {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
                    {creating ? "Criar" : "Salvar"}
                </Button>
            </div>
        </form>
    )
}
