"use client"

import { useFieldArray, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form"
import { AnimatePresence, motion } from "framer-motion"
import { KeyRound, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { McpFormValues } from "../form-schemas"

/**
 * Variáveis de ambiente (MCP local) ou cabeçalhos (remoto): nome + valor mascarado. Nas existentes o
 * valor salvo nunca é exibido — vazio mantém o atual; remover a linha apaga a variável.
 */
export function SecretRowsField({ name, label, control, register, errors }: { name: "environment" | "headers"; label: string; control: Control<McpFormValues>; register: UseFormRegister<McpFormValues>; errors: FieldErrors<McpFormValues> }) {
    const rows = useFieldArray({ control, name })
    const listError = errors[name]?.root?.message ?? errors[name]?.message
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    {label}
                </Label>
                <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => rows.append({ key: "", value: "", existing: false })}>
                    <Plus className="h-4 w-4" aria-hidden /> Adicionar
                </Button>
            </div>
            <AnimatePresence initial={false}>
                {rows.fields.map((row, index) => {
                    const rowErrors = errors[name]?.[index]
                    return (
                        <motion.div key={row.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
                            <div>
                                <Input aria-label="Nome" placeholder="NOME" className="font-mono" readOnly={row.existing} {...register(`${name}.${index}.key`)} />
                                {rowErrors?.key?.message ? <p className="mt-1 text-xs text-destructive">{rowErrors.key.message}</p> : null}
                            </div>
                            <div>
                                <Input aria-label="Valor" type="password" autoComplete="new-password" placeholder={row.existing ? "•••••••• (mantém o atual)" : "Valor"} {...register(`${name}.${index}.value`)} />
                                {rowErrors?.value?.message ? <p className="mt-1 text-xs text-destructive">{rowErrors.value.message}</p> : null}
                            </div>
                            <Button type="button" variant="ghost" size="icon" aria-label="Remover" onClick={() => rows.remove(index)}>
                                <Trash2 className="h-4 w-4" aria-hidden />
                            </Button>
                        </motion.div>
                    )
                })}
            </AnimatePresence>
            {rows.fields.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum(a). Os valores ficam só na configuração do OpenCode e nunca voltam para a tela.</p> : null}
            {listError ? <p className="text-xs text-destructive">{listError}</p> : null}
        </div>
    )
}
