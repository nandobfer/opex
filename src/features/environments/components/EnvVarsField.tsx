"use client"

import { useFieldArray, type UseFormReturn } from "react-hook-form"
import { AnimatePresence, motion } from "framer-motion"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EnvironmentInput } from "../schemas"

/** Primeira mensagem de erro das variáveis (a do array ou a de um nome). */
function envError(errors: unknown): string | null {
    if (!errors || typeof errors !== "object") return null
    const own = (errors as { message?: string; root?: { message?: string } }).message ?? (errors as { root?: { message?: string } }).root?.message
    if (own) return own
    if (Array.isArray(errors)) for (const item of errors as ({ key?: { message?: string } } | undefined)[]) if (item?.key?.message) return item.key.message
    return null
}

/** Variáveis extras (cifradas no servidor). Na edição, valor vazio mantém o salvo. */
export function EnvVarsField({ form, editing }: { form: UseFormReturn<EnvironmentInput>; editing: boolean }) {
    const vars = useFieldArray({ control: form.control, name: "env" })
    const errors = form.formState.errors.env
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <Label>Variáveis extras (cifradas)</Label>
                <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => vars.append({ key: "", value: "" })}>
                    <Plus className="h-4 w-4" aria-hidden /> Variável
                </Button>
            </div>
            <AnimatePresence initial={false}>
                {vars.fields.map((field, index) => (
                    <motion.div key={field.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="flex gap-2">
                        <Input aria-label={`Nome da variável ${index + 1}`} className="flex-1 font-mono" placeholder="NOME" {...form.register(`env.${index}.key`)} />
                        <Input aria-label={`Valor da variável ${index + 1}`} type="password" autoComplete="off" className="flex-1 font-mono" placeholder={editing ? "(mantém o valor salvo)" : "valor"} {...form.register(`env.${index}.value`)} />
                        <Button type="button" variant="ghost" size="icon" aria-label={`Remover a variável ${index + 1}`} onClick={() => vars.remove(index)}>
                            <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                    </motion.div>
                ))}
            </AnimatePresence>
            {envError(errors) && <p className="text-xs text-destructive">{envError(errors)}</p>}
            {!vars.fields.length && <p className="text-xs text-muted-foreground">Nenhuma. Gravadas em .env.opex e passadas com --env-file.</p>}
        </div>
    )
}
