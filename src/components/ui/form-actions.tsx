"use client"

import { Loader2, Save, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FormFooter } from "@/components/ui/form-footer"

interface FormActionsProps {
    dirty: boolean
    pending: boolean
    /** Validade do formulário (padrão `true`). */
    valid?: boolean
    onUndo: () => void
    /** Ação de salvar; sem ela o botão envia o formulário (`type="submit"`). */
    onSave?: () => void
    /** Rótulo do botão de salvar (ex.: "Salvar ambiente"). */
    saveLabel?: string
    /** Bloqueia o salvar mesmo com alterações (ex.: operação em andamento no ambiente). */
    disabled?: boolean
}

/**
 * Rodapé padrão dos formulários do app: **Desfazer + Salvar** no `FormFooter` (borda superior,
 * botões à direita). O salvar envia o formulário por padrão; com `onSave` vira um botão próprio
 * (telas em que o salvar não é o envio do `<form>`).
 */
export function FormActions({ dirty, pending, valid = true, onUndo, onSave, saveLabel = "Salvar", disabled = false }: FormActionsProps) {
    return (
        <FormFooter>
            <Button type="button" variant="outline" className="gap-1.5" disabled={!dirty || pending} onClick={onUndo}>
                <Undo2 className="h-4 w-4" aria-hidden /> Desfazer
            </Button>
            <Button
                type={onSave ? "button" : "submit"}
                className="gap-1.5"
                disabled={!dirty || pending || !valid || disabled}
                onClick={onSave}
            >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                {saveLabel}
            </Button>
        </FormFooter>
    )
}
