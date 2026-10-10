"use client"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { useDeleteCliente } from "../../hooks/useOrcamentos"
import type { ClienteOrcamentoDto } from "../../types"

/** Confirmação da exclusão de um cliente (apaga também os rascunhos dele). */
export function RemoveClienteDialog({ client, onClose }: { client: ClienteOrcamentoDto | null; onClose: () => void }) {
    const remove = useDeleteCliente()

    return (
        <AlertDialog open={client !== null} onOpenChange={(next) => !next && onClose()}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Excluir o cliente {client?.name}?</AlertDialogTitle>
                    <AlertDialogDescription>O token deixa de funcionar imediatamente e os rascunhos do portal são apagados. As tarefas já criadas permanecem.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={() => {
                            if (client) remove.mutate(client)
                            onClose()
                        }}
                    >
                        Excluir
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
