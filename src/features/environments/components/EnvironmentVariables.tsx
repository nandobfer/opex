"use client"

import { useFieldArray, useWatch, type UseFormReturn } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field } from "@/components/ui/field"
import type { EnvironmentInput } from "../schemas"

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
        <section className="space-y-4 rounded-lg border p-6">
            <h2 className="font-semibold">Variáveis de ambiente</h2>
            <p className="text-sm text-muted-foreground">
                Valores privados são cifrados e somente substituíveis pelo dono. Vazio em um segredo já configurado
                mantém o valor.
            </p>
            {variables.fields.map((variable, index) => (
                <div key={variable.id} className="grid gap-3 rounded-md border p-4">
                    <Field id={`var-name-${index}`} label="Nome" error={errors.variables?.[index]?.name?.message}>
                        <Input
                            id={`var-name-${index}`}
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
                    <label className="flex gap-2 text-sm">
                        <input
                            type="checkbox"
                            disabled={!canManageSecrets}
                            {...form.register(`variables.${index}.secret`)}
                        />
                        Privada
                    </label>
                    <Button
                        type="button"
                        variant="ghost"
                        disabled={variable.secret && !canManageSecrets}
                        onClick={() => variables.remove(index)}
                    >
                        Remover variável
                    </Button>
                </div>
            ))}
            {errors.variables?.message && (
                <p role="alert" className="text-sm text-destructive">
                    {errors.variables.message}
                </p>
            )}
            <Button
                type="button"
                variant="outline"
                onClick={() => variables.append({ name: "", value: "", secret: false })}
            >
                Adicionar variável
            </Button>
        </section>
    )
}
