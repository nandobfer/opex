"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MarkdownResourceFields } from "@/components/resources/MarkdownResourceFields"
import { apiErrorCode, apiErrorMessage } from "@/lib/api"
import { opexSkillFormSchema, type OpexSkillFormValues } from "../../../skill-form-schemas"
import { OpexSkillFilesField } from "./OpexSkillFilesField"

interface OpexSkillFormProps {
    initial: OpexSkillFormValues
    /** Na criação: nomes já usados (validação em tempo real do nome único). */
    takenNames: readonly string[]
    skillId: string | null
    pending: boolean
    /** Grava; um erro volta para o formulário (mensagem no campo, o que foi digitado fica). */
    onSubmit: (values: OpexSkillFormValues) => Promise<unknown>
    onCancel: () => void
}

/** Criar/editar skill do Opex: `name` (= pasta), `description`, corpo em Markdown e arquivos de apoio. */
export function OpexSkillForm({ initial, takenNames, skillId, pending, onSubmit, onCancel }: OpexSkillFormProps) {
    const creating = skillId === null
    const form = useForm<OpexSkillFormValues>({ resolver: zodResolver(opexSkillFormSchema(creating ? takenNames : [])), mode: "onChange", defaultValues: initial })
    const submit = async (values: OpexSkillFormValues) => {
        try {
            await onSubmit(values)
        } catch (error) {
            const code = apiErrorCode(error)
            const field = code === "OPEX_SKILL_NAME_TAKEN" ? "name" : "root"
            form.setError(field, { message: apiErrorMessage(error, "Não foi possível salvar a skill") })
        }
    }
    const rootError = form.formState.errors.root?.message
    return (
        <form className="space-y-4" onSubmit={form.handleSubmit(submit)} noValidate>
            <MarkdownResourceFields form={form} creating={creating} idPrefix="opex-skill" descriptionLabel="Descrição (quando usar)" descriptionPlaceholder="Use quando o usuário pedir…" bodyLabel="Instruções (corpo do SKILL.md)" />
            <OpexSkillFilesField form={form} skillId={skillId} />
            {rootError ? (
                <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {rootError}
                </p>
            ) : null}
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
