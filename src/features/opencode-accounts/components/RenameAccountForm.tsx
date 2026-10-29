"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useRenameOpencodeAccount } from "../hooks/useOpencodeAccounts"
import { renameAccountSchema, type OpencodeAccountDto, type RenameAccountInput } from "../types"

/** Renomear a conta em linha. Enter salva e Esc cancela (sem `<form>`: a página já é um formulário). */
export function RenameAccountForm({ account, onDone }: { account: OpencodeAccountDto; onDone: () => void }) {
    const rename = useRenameOpencodeAccount()
    const form = useForm<RenameAccountInput>({ resolver: zodResolver(renameAccountSchema), mode: "onChange", defaultValues: { label: account.label } })
    const error = form.formState.errors.label?.message

    const submit = form.handleSubmit(async ({ label }) => {
        const saved = await rename.mutateAsync({ accountId: account.id, label }).then(() => true, () => false)
        if (saved) onDone()
    })

    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2">
                <Input
                    autoFocus
                    aria-label="Nome da conta"
                    {...form.register("label")}
                    onKeyDown={(event) => {
                        if (event.key === "Escape") {
                            event.preventDefault()
                            event.stopPropagation()
                            onDone()
                        }
                        if (event.key !== "Enter") return
                        event.preventDefault()
                        event.stopPropagation()
                        void submit()
                    }}
                />
                <Button type="button" size="sm" disabled={rename.isPending || !form.formState.isValid} onClick={() => void submit()}>
                    {rename.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
                    Salvar
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={onDone}>
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
