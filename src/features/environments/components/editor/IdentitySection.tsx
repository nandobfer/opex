"use client"

import { useWatch, type UseFormReturn } from "react-hook-form"
import { FormSection } from "@/components/form-page/FormSection"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { sectionAnchor } from "../../editor-sections"
import type { EnvironmentInput } from "../../schemas"
import { slugify } from "../../view"

/** Identificação: nome e slug (no Novo, o slug acompanha o nome até ser editado à mão). */
export function IdentitySection({ form, editing }: { form: UseFormReturn<EnvironmentInput>; editing: boolean }) {
    const errors = form.formState.errors
    const name = useWatch({ control: form.control, name: "name" })
    // No Novo, o nome do projeto do compose acompanha o slug até ser editado à mão (o adotado tem o próprio).
    const followSlug = (slug: string) => {
        if (editing || form.getFieldState("source.projectName").isDirty || form.getValues("source")?.kind === "adopted") return
        form.setValue("source.projectName", slug, { shouldValidate: form.formState.isSubmitted })
    }
    return (
        <FormSection id={sectionAnchor("identidade")} title="Identificação" description="Como o ambiente aparece na lista. O slug nomeia a pasta e as imagens no host.">
            <div className={FORM_GRID}>
                <Field id="environment-name" label="Nome" error={errors.name?.message}>
                    <Input
                        id="environment-name"
                        aria-invalid={errors.name ? true : undefined}
                        placeholder="Loja (homologação)"
                        {...form.register("name", {
                            onChange: (event: { target: { value: string } }) => {
                                if (editing || form.getFieldState("slug").isDirty) return
                                const slug = slugify(event.target.value)
                                form.setValue("slug", slug, { shouldValidate: true })
                                followSlug(slug)
                            },
                        })}
                    />
                </Field>
                <Field id="environment-slug" label="Slug" error={errors.slug?.message}>
                    <Input
                        id="environment-slug"
                        aria-invalid={errors.slug ? true : undefined}
                        className="font-mono"
                        placeholder={slugify(name ?? "") || "loja-homologacao"}
                        {...form.register("slug", { onChange: (event: { target: { value: string } }) => followSlug(event.target.value) })}
                    />
                </Field>
            </div>
        </FormSection>
    )
}
