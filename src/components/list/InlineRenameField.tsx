"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface InlineRenameFieldProps {
    defaultValue: string
    /** Rótulo acessível do campo (ex.: "Nome da conta"). */
    label: string
    /** Regra do nome: o mesmo schema Zod da API (ex.: `renameAiApiKeySchema.shape.name`). */
    schema: z.ZodType<string, string>
    pending: boolean
    /** Grava; `true` fecha o campo. */
    onSave: (value: string) => Promise<boolean>
    onCancel: () => void
}

/**
 * Renomear um item em linha. Enter salva e Esc cancela; sem `<form>`, porque as telas de integração já
 * são um formulário (contas do OpenCode, chaves de API dos provedores de IA).
 */
export function InlineRenameField({ defaultValue, label, schema, pending, onSave, onCancel }: InlineRenameFieldProps) {
    const form = useForm<{ value: string }>({ resolver: zodResolver(z.object({ value: schema })), mode: "onChange", defaultValues: { value: defaultValue } })
    const error = form.formState.errors.value?.message

    const submit = form.handleSubmit(async ({ value }) => {
        if (await onSave(value)) onCancel()
    })

    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2">
                <Input
                    autoFocus
                    aria-label={label}
                    {...form.register("value")}
                    onKeyDown={(event) => {
                        if (event.key === "Escape") {
                            event.preventDefault()
                            event.stopPropagation()
                            onCancel()
                        }
                        if (event.key !== "Enter") return
                        event.preventDefault()
                        event.stopPropagation()
                        void submit()
                    }}
                />
                <Button type="button" size="sm" disabled={pending || !form.formState.isValid} onClick={() => void submit()}>
                    {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
                    Salvar
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
                    Cancelar
                </Button>
            </div>
            {error && (
                <p role="alert" className="text-xs text-destructive">
                    {error}
                </p>
            )}
        </div>
    )
}
