"use client"

import { useWatch, type UseFormReturn } from "react-hook-form"
import { AlertCircle, Plus, RotateCw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { KEY_VALUE_ROW, KeyValueRows } from "@/components/ui/key-value-rows"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { importSummary, NO_VARIABLES_FOUND, parseEnvText, upsertEnvVars } from "../env-import"
import type { EnvironmentInput } from "../schemas"
import { EnvImportMenu } from "./EnvImportMenu"

/** Estado da leitura dos valores salvos (Editar). */
export type EnvValuesStatus = "ready" | "loading" | "error"

const ROW = KEY_VALUE_ROW

/** Primeira mensagem de erro das variáveis (a do array ou a de um nome). */
function envError(errors: unknown): string | null {
    if (!errors || typeof errors !== "object") return null
    const own = (errors as { message?: string; root?: { message?: string } }).message ?? (errors as { root?: { message?: string } }).root?.message
    if (own) return own
    if (Array.isArray(errors)) for (const item of errors as ({ key?: { message?: string } } | undefined)[]) if (item?.key?.message) return item.key.message
    return null
}

/** Linhas de carregamento com as mesmas dimensões das linhas de variável. */
function EnvVarsSkeleton() {
    return (
        <div className="space-y-2" aria-label="Carregando as variáveis">
            {[0, 1].map((row) => (
                <div key={row} className={ROW}>
                    <Skeleton className="h-9 flex-1" />
                    <Skeleton className="h-9 flex-1" />
                    <Skeleton className="h-9 w-9" />
                </div>
            ))}
        </div>
    )
}

/**
 * Variáveis extras (cifradas no servidor), com os valores à vista. Em Editar os valores salvos são
 * lidos à parte: carregando, mostra o skeleton; com erro, o aviso e "Tentar novamente" (o Salvar fica
 * bloqueado no formulário). Importar faz upsert na lista do formulário (só grava no Salvar).
 */
export function EnvVarsField({ form, status = "ready", onRetry }: { form: UseFormReturn<EnvironmentInput>; status?: EnvValuesStatus; onRetry?: () => void }) {
    const rows = useWatch({ control: form.control, name: "env" }) ?? []
    const setRows = (next: EnvironmentInput["env"]) => form.setValue("env", next, { shouldValidate: true, shouldDirty: true })
    const errors = form.formState.errors.env
    const importText = (text: string): boolean => {
        const parsed = parseEnvText(text)
        if (!parsed.entries.length) {
            toast.warning(NO_VARIABLES_FOUND)
            return false
        }
        const result = upsertEnvVars(form.getValues("env"), parsed.entries)
        setRows(result.next)
        toast.success(importSummary({ ...result, ignored: parsed.ignored }))
        return true
    }
    const ready = status === "ready"
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <Label>Variáveis extras (cifradas)</Label>
                <div className="flex items-center gap-1">
                    <EnvImportMenu onImport={importText} disabled={!ready} />
                    <Button type="button" variant="ghost" size="sm" className="gap-1" disabled={!ready} onClick={() => setRows([...form.getValues("env"), { key: "", value: "" }])}>
                        <Plus className="h-4 w-4" aria-hidden /> Variável
                    </Button>
                </div>
            </div>
            {status === "loading" && <EnvVarsSkeleton />}
            {status === "error" && (
                <div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 px-3 py-2 text-xs text-destructive">
                    <span className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden /> Não foi possível carregar os valores das variáveis. Salvar fica bloqueado para não gravar valores vazios por cima dos salvos.
                    </span>
                    <Button type="button" variant="outline" size="sm" className="gap-1" onClick={onRetry}>
                        <RotateCw className="h-4 w-4" aria-hidden /> Tentar novamente
                    </Button>
                </div>
            )}
            {ready && (
                <KeyValueRows
                    rows={rows}
                    onChange={setRows}
                    itemLabel="variável"
                    valuePlaceholder={(row) => (row.keep ? "(valor salvo mantido)" : "valor")}
                    onValueEdit={(row) => (row.keep ? { ...row, keep: false } : row)}
                    hint={(row) => (row.keep ? <p className="text-xs text-muted-foreground">Não foi possível ler o valor salvo: ele é mantido se você não digitar outro.</p> : null)}
                />
            )}
            {envError(errors) && <p className="text-xs text-destructive">{envError(errors)}</p>}
            {ready && !rows.length && <p className="text-xs text-muted-foreground">Nenhuma. Gravadas em .env.opex e passadas com --env-file.</p>}
        </div>
    )
}
