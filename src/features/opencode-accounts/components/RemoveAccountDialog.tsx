"use client"

import { Loader2 } from "lucide-react"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useRemoveOpencodeAccount } from "../hooks/useOpencodeAccounts"
import type { OpencodeAccountDto } from "../types"

/** Confirmação de remoção; a conta em uso leva o aviso de que o provider fica sem conta. */
export function RemoveAccountDialog({ account, open, onOpenChange }: { account: OpencodeAccountDto; open: boolean; onOpenChange: (open: boolean) => void }) {
    const remove = useRemoveOpencodeAccount()

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Remover a conta &quot;{account.label}&quot;?</AlertDialogTitle>
                    <AlertDialogDescription>
                        {account.active
                            ? "Esta é a conta em uso: o provider fica sem conta selecionada e as próximas chamadas do OpenCode podem falhar até você selecionar ou adicionar outra. A credencial é apagada do OpenCode."
                            : "A credencial é apagada do OpenCode. Para usá-la de novo, será preciso adicioná-la outra vez."}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={remove.isPending}
                        onClick={(event) => {
                            event.preventDefault()
                            remove.mutate({ accountId: account.id }, { onSuccess: () => onOpenChange(false) })
                        }}
                    >
                        {remove.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
                        Remover
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
