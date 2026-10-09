"use client"

import { Loader2, Save, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Desfazer/Salvar das abas de configuração da central. */
export function FormActions({ dirty, pending, valid, onUndo }: { dirty: boolean; pending: boolean; valid: boolean; onUndo: () => void }) {
    return (
        <div className="flex flex-wrap justify-end gap-2 border-t pt-6">
            <Button type="button" variant="outline" className="gap-1.5" disabled={!dirty || pending} onClick={onUndo}>
                <Undo2 className="h-4 w-4" aria-hidden /> Desfazer
            </Button>
            <Button type="submit" className="gap-1.5" disabled={!dirty || pending || !valid}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                Salvar
            </Button>
        </div>
    )
}
