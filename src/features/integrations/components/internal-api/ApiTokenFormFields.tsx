"use client"

import { Controller, type UseFormReturn } from "react-hook-form"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { ApiTokenInput } from "../../api-tokens/schemas"
import type { ApiTokenScopeCatalogDto } from "../../api-tokens/types"
import { dateFromExpiry, expiryFromDate } from "../../api-tokens/ui"
import { ApiTokenScopeForm } from "./ApiTokenScopeForm"

const tomorrow = () => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() + 1)
    return date
}

/** Campos do formulário do token: nome (só na geração), escopos e expiração opcional. */
export function ApiTokenFormFields({ form, catalog, editing }: { form: UseFormReturn<ApiTokenInput>; catalog: ApiTokenScopeCatalogDto; editing: boolean }) {
    const errors = form.formState.errors
    return (
        <div className="space-y-4">
            {!editing && (
                <Field id="api-token-nome" label="Nome (quem vai usar)" error={errors.nome?.message}>
                    <Input id="api-token-nome" autoComplete="off" placeholder="Script de relatórios" {...form.register("nome")} />
                </Field>
            )}
            <Controller
                control={form.control}
                name="escopos"
                render={({ field, fieldState }) => <ApiTokenScopeForm catalog={catalog} initialScopes={field.value ?? []} onChange={field.onChange} error={fieldState.error?.message} />}
            />
            <Controller
                control={form.control}
                name="expiraEm"
                render={({ field, fieldState }) => (
                    <Field id="api-token-expira" label="Expiração (opcional)" error={fieldState.error?.message}>
                        <div className="flex w-full items-center gap-2">
                            <DatePicker id="api-token-expira" className="flex-1" value={dateFromExpiry(field.value)} onChange={(value) => field.onChange(expiryFromDate(value))} fromDate={tomorrow()} disabled={{ before: tomorrow() }} placeholder="Não expira" />
                            {field.value && (
                                <Button type="button" size="sm" variant="ghost" onClick={() => field.onChange(null)} aria-label="Remover expiração">
                                    <X className="h-4 w-4" aria-hidden />
                                </Button>
                            )}
                        </div>
                    </Field>
                )}
            />
        </div>
    )
}
