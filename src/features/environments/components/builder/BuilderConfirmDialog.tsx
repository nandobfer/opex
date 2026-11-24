"use client"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { builderConfirmText, type BuilderConfirmKind } from "../../builder-view"
import type { BuilderActionInput } from "../../schemas"
import type { EnvironmentsBuilderDto } from "../../types"

/** Confirmação de Apagar (perde o cache) e de Derrubar com um build em andamento (ele falha). */
export function BuilderConfirmDialog({ kind, builder, onClose, onConfirm }: { kind: BuilderConfirmKind | null; builder: EnvironmentsBuilderDto; onClose: () => void; onConfirm: (input: BuilderActionInput) => void }) {
    const text = builderConfirmText(kind ?? "delete", builder)
    return (
        <AlertDialog open={kind !== null} onOpenChange={(open) => !open && onClose()}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{text.title}</AlertDialogTitle>
                    <AlertDialogDescription>{text.description}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => {
                            if (kind === "delete") onConfirm({ action: "delete", confirm: true, force: builder.buildRunning })
                            if (kind === "stop") onConfirm({ action: "stop", force: true })
                            onClose()
                        }}
                    >
                        {text.action}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
