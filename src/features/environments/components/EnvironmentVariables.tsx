"use client"

import { useFieldArray, useWatch, type UseFormReturn } from "react-hook-form"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field } from "@/components/ui/field"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { FORM_GRID } from "@/components/ui/form-grid"
import type { EnvironmentInput } from "../schemas"

/** Variáveis de ambiente do ambiente: valor público ou privado (cifrado, somente substituível pelo dono). */
export function EnvironmentVariables({
    form,
    canManageSecrets,
}: {
    form: UseFormReturn<EnvironmentInput>
    canManageSecrets: boolean
}) {
    const variables = useFieldArray({ control: form.control, name: "variables" })
    const watched = useWatch({ control: form.control, name: "variables" })
    const errors = form.formState.errors
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Variáveis de ambiente</CardTitle>
                <CardDescription>
                    Valores privados são cifrados e somente substituíveis pelo dono. Deixar vazio um segredo já configurado
                    mantém o valor atual.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {!variables.fields.length && <p className="text-sm text-muted-foreground">Nenhuma variável configurada.</p>}
                <ul className="divide-y">
                    {variables.fields.map((variable, index) => (
                        <li key={variable.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
                            <div className={FORM_GRID}>
                                <Field id={`var-name-${index}`} label="Nome" error={errors.variables?.[index]?.name?.message}>
                                    <Input
                                        id={`var-name-${index}`}
                                        className="font-mono"
                                        {...form.register(`variables.${index}.name`)}
                                        readOnly={variable.secret && !canManageSecrets}
                                    />
                                </Field>
                                <Field
                                    id={`var-value-${index}`}
                                    label={watched[index]?.secret ? "Novo valor privado (opcional)" : "Valor"}
                                    error={errors.variables?.[index]?.value?.message}
                                >
                                    <Input
                                        id={`var-value-${index}`}
                                        type={watched[index]?.secret ? "password" : "text"}
                                        autoComplete="off"
                                        readOnly={variable.secret && !canManageSecrets}
                                        {...form.register(`variables.${index}.value`)}
                                    />
                                </Field>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        disabled={!canManageSecrets}
                                        {...form.register(`variables.${index}.secret`)}
                                    />
                                    Privada
                                </label>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 shrink-0"
                                                aria-label={`Remover variável ${index + 1}`}
                                                disabled={variable.secret && !canManageSecrets}
                                                onClick={() => variables.remove(index)}
                                            >
                                                <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Remover variável</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                        </li>
                    ))}
                </ul>
                {errors.variables?.message && (
                    <p role="alert" className="text-sm text-destructive">
                        {errors.variables.message}
                    </p>
                )}
                <Button
                    type="button"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => variables.append({ name: "", value: "", secret: false })}
                >
                    <Plus className="h-4 w-4" aria-hidden /> Adicionar variável
                </Button>
            </CardContent>
        </Card>
    )
}
