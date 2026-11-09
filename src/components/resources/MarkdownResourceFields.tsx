"use client"

import type { ReactNode } from "react"
import { Controller, type FieldErrors, type Path, type UseFormReturn } from "react-hook-form"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { MarkdownField } from "@/components/ui/markdown-field"

export interface MarkdownTextValues {
    name: string
    description: string
    body: string
}

interface MarkdownResourceFieldsProps<T extends MarkdownTextValues> {
    form: UseFormReturn<T>
    creating: boolean
    descriptionLabel: string
    descriptionPlaceholder: string
    bodyLabel: string
    /** Campos extras na grade, depois do nome e da descrição. */
    children?: ReactNode
    idPrefix?: string
}

/**
 * Campos de um recurso em Markdown com frontmatter (OPE-153, extraídos do editor do OpenCode): nome (fixo
 * na edição), descrição e corpo em Markdown. O formulário (schema Zod da API) fica com quem chama.
 */
export function MarkdownResourceFields<T extends MarkdownTextValues>({ form, creating, descriptionLabel, descriptionPlaceholder, bodyLabel, children, idPrefix = "resource" }: MarkdownResourceFieldsProps<T>) {
    const errors = form.formState.errors as FieldErrors<MarkdownTextValues>
    const id = (field: string) => `${idPrefix}-${field}`
    return (
        <>
            <div className={FORM_GRID}>
                <Field id={id("name")} label="Nome" error={errors.name?.message}>
                    <Input id={id("name")} {...form.register("name" as Path<T>)} disabled={!creating} placeholder="meu-item" className="font-mono" />
                </Field>
                <Field id={id("description")} label={descriptionLabel} error={errors.description?.message}>
                    <Input id={id("description")} {...form.register("description" as Path<T>)} placeholder={descriptionPlaceholder} />
                </Field>
                {children}
            </div>
            <Field id={id("body")} label={bodyLabel} error={errors.body?.message}>
                <Controller
                    control={form.control}
                    name={"body" as Path<T>}
                    render={({ field }) => <MarkdownField id={id("body")} value={String(field.value ?? "")} onChange={field.onChange} rows={12} invalid={Boolean(errors.body)} ariaLabel={bodyLabel} />}
                />
            </Field>
        </>
    )
}
