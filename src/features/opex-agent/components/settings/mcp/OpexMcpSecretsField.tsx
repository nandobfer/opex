"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useFieldArray, useWatch, type UseFormReturn } from "react-hook-form"
import { KeyRound, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { IconAction } from "@/components/ui/icon-action"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SecretValueInput } from "@/components/ui/secret-value-input"
import { OPEX_MCP_SECRETS_MAX, type OpexMcpSecretStateDto, type OpexMcpServerInput } from "../../../mcp"

interface OpexMcpSecretsFieldProps {
    form: UseFormReturn<OpexMcpServerInput>
    name: "headers" | "env"
    /** Chaves já salvas (o valor nunca volta). */
    saved: readonly OpexMcpSecretStateDto[]
    disabled: boolean
}

const TEXTS = {
    headers: { title: "Headers", hint: "Enviados em toda requisição ao MCP (ex.: Authorization: Bearer …).", add: "Adicionar header", placeholder: "Authorization" },
    env: { title: "Variáveis de ambiente", hint: "Entregues ao processo do MCP (ex.: GITHUB_TOKEN).", add: "Adicionar variável", placeholder: "GITHUB_TOKEN" },
} as const

/**
 * Lista nome → valor secreto. O valor salvo nunca é exibido: vazio mantém o salvo da mesma chave,
 * "Substituir" grava um novo e a lixeira remove a linha ao salvar.
 */
export function OpexMcpSecretsField({ form, name, saved, disabled }: OpexMcpSecretsFieldProps) {
    const { fields, append, remove } = useFieldArray({ control: form.control, name })
    const values = useWatch({ control: form.control, name }) ?? []
    const savedKeys = new Set(saved.filter((entry) => entry.configured).map((entry) => entry.key))
    const texts = TEXTS[name]
    const errors = form.formState.errors[name]

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
                <Label className="flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> {texts.title}
                </Label>
                <Button type="button" variant="ghost" size="sm" className="gap-1.5" disabled={disabled || fields.length >= OPEX_MCP_SECRETS_MAX} onClick={() => append({ key: "", value: "" })}>
                    <Plus className="h-3.5 w-3.5" aria-hidden /> {texts.add}
                </Button>
            </div>
            <p className="text-xs text-muted-foreground">{texts.hint} Gravados cifrados; o valor nunca volta para a tela.</p>
            <ul className="space-y-2">
                <AnimatePresence initial={false}>
                    {fields.map((field, index) => {
                        const key = values[index]?.key ?? ""
                        const configured = savedKeys.has(key)
                        const value = values[index]?.value ?? ""
                        const rowErrors = Array.isArray(errors) ? errors[index] : undefined
                        return (
                            <motion.li key={field.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                                <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto]">
                                    <Input aria-label={`${texts.title}: nome ${index + 1}`} placeholder={texts.placeholder} className="font-mono" autoComplete="off" disabled={disabled} {...form.register(`${name}.${index}.key`)} />
                                    <SecretValueInput
                                        key={configured ? "saved" : "new"}
                                        id={`mcp-${name}-${index}`}
                                        label={key || "valor"}
                                        configured={configured}
                                        statusLabel="Configurado"
                                        allowClear={false}
                                        initiallyEditing={!configured}
                                        action={value ? { action: "set", value } : undefined}
                                        disabled={disabled}
                                        onChange={(action) => form.setValue(`${name}.${index}.value`, action?.action === "set" ? action.value : "", { shouldDirty: true, shouldValidate: true })}
                                    />
                                    <IconAction label="Remover" icon={Trash2} tone="danger" onClick={() => remove(index)} className="h-10 w-10" />
                                </div>
                                {(rowErrors?.key?.message || rowErrors?.value?.message) && <p className="mt-1 text-xs text-destructive">{rowErrors?.key?.message ?? rowErrors?.value?.message}</p>}
                            </motion.li>
                        )
                    })}
                </AnimatePresence>
            </ul>
        </div>
    )
}
