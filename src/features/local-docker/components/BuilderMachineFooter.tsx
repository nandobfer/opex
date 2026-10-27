"use client"

import { Loader2, Save, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Rodapé das abas de configuração: desfazer e salvar (configuração do PC + Geral da integração). */
export function BuilderMachineFooter({ dirty, canSave, pending, onUndo }: { dirty: boolean; canSave: boolean; pending: boolean; onUndo: () => void }) {
    return (
        <div className="flex flex-wrap justify-end gap-2 border-t pt-6">
            <Button type="button" variant="outline" className="gap-1.5" disabled={!dirty || pending} onClick={onUndo}>
                <Undo2 className="h-4 w-4" aria-hidden /> Desfazer
            </Button>
            <Button type="submit" data-ctrl-enter-submit className="gap-1.5" disabled={!canSave || pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                Salvar
            </Button>
        </div>
    )
}
