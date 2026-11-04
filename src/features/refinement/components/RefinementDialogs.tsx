"use client"

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
import { REFINEMENT_CLOSE_CONFIRM } from "../constants"

interface ConfirmProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onConfirm: () => void
}

/** Confirmação do "Recomeçar" do refinamento (página da tarefa e mesa). */
export function RefinementRestartDialog({ open, onOpenChange, onConfirm }: ConfirmProps) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Recomeçar o refinamento?</AlertDialogTitle>
                    <AlertDialogDescription>A conversa atual é descartada e uma nova sessão começa do zero. A especificação já salva na tarefa é mantida.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={() => {
                            onOpenChange(false)
                            onConfirm()
                        }}
                    >
                        Recomeçar
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

/** Confirmação do "Encerrar refinamento" (OPE-137, item 13). */
export function RefinementCloseDialog({ open, onOpenChange, onConfirm }: ConfirmProps) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Encerrar refinamento</AlertDialogTitle>
                    <AlertDialogDescription>{REFINEMENT_CLOSE_CONFIRM}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={() => {
                            onOpenChange(false)
                            onConfirm()
                        }}
                    >
                        Encerrar refinamento
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
