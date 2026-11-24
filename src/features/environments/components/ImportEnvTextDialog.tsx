"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

/**
 * "Importar texto": cola um conteúdo no formato `.env`. Sem `<form>` próprio: o diálogo fica dentro
 * do formulário do ambiente (o submit atravessaria o portal e enviaria o ambiente).
 */
export function ImportEnvTextDialog({ open, onClose, onImport }: { open: boolean; onClose: () => void; onImport: (text: string) => boolean }) {
    const [text, setText] = useState("")
    const close = () => {
        setText("")
        onClose()
    }
    const submit = () => {
        if (onImport(text)) close()
    }
    return (
        <Dialog open={open} onOpenChange={(value) => !value && close()}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Importar texto</DialogTitle>
                    <DialogDescription>Uma variável por linha no formato CHAVE=VALOR; linhas que começam com # são comentários.</DialogDescription>
                </DialogHeader>
                <div className="space-y-1">
                    <Label htmlFor="environment-env-import-text">Conteúdo</Label>
                    <Textarea id="environment-env-import-text" vim={false} rows={12} className="font-mono text-xs" placeholder={"# Banco\nDATABASE_URL=postgres://app:senha@db:5432/app\nPORT=3000"} value={text} onChange={(event) => setText(event.target.value)} />
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={close}>
                        Cancelar
                    </Button>
                    <Button type="button" disabled={!text.trim()} onClick={submit}>
                        Importar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
