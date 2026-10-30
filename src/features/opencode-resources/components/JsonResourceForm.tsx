"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { jsonFormSchema, type JsonFormValues } from "../form-schemas"

/** Agente/comando definido no JSON da configuração: edição do objeto, validado antes de salvar. */
export function JsonResourceForm({ kind, initial, pending, onSubmit, onCancel }: { kind: "agent" | "command"; initial: Record<string, unknown>; pending: boolean; onSubmit: (config: Record<string, unknown>) => void; onCancel: () => void }) {
    const form = useForm<JsonFormValues>({ resolver: zodResolver(jsonFormSchema(kind)), mode: "onChange", defaultValues: { json: JSON.stringify(initial, null, 2) } })
    const error = form.formState.errors.json?.message
    return (
        <form className="space-y-4" onSubmit={form.handleSubmit((values) => onSubmit(JSON.parse(values.json) as Record<string, unknown>))} noValidate>
            <Field id="resource-json" label="Objeto no JSON da configuração" error={error}>
                <Textarea id="resource-json" vim={false} rows={16} spellCheck={false} className="font-mono text-xs" aria-invalid={Boolean(error)} {...form.register("json")} />
            </Field>
            <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
                    Cancelar
                </Button>
                <Button type="submit" disabled={pending || !form.formState.isValid}>
                    {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
                    Salvar
                </Button>
            </div>
        </form>
    )
}
