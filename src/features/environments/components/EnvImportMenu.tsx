"use client"

import { useRef, useState } from "react"
import { FileUp, TextCursorInput, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ENV_IMPORT_MAX_BYTES } from "../env-import"
import { ImportEnvTextDialog } from "./ImportEnvTextDialog"

/**
 * Botão Importar das Variáveis extras: "Importar .env" (seletor de arquivos, lido como texto) e
 * "Importar texto" (diálogo). `onImport` aplica o conteúdo e diz se havia alguma variável.
 */
export function EnvImportMenu({ onImport, disabled = false }: { onImport: (text: string) => boolean; disabled?: boolean }) {
    const fileRef = useRef<HTMLInputElement>(null)
    const [textOpen, setTextOpen] = useState(false)
    const readFile = async (file: File | undefined) => {
        if (!file) return
        if (file.size > ENV_IMPORT_MAX_BYTES) {
            toast.error("Arquivo grande demais para importar (máximo 1 MB)")
            return
        }
        try {
            onImport(await file.text())
        } catch {
            toast.error("Não foi possível ler o arquivo")
        }
    }
    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="gap-1" disabled={disabled}>
                        <Upload className="h-4 w-4" aria-hidden /> Importar
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
                        <FileUp className="h-4 w-4" aria-hidden /> Importar .env
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setTextOpen(true)}>
                        <TextCursorInput className="h-4 w-4" aria-hidden /> Importar texto
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <input
                ref={fileRef}
                type="file"
                className="hidden"
                aria-label="Arquivo .env para importar"
                onChange={(event) => {
                    const file = event.target.files?.[0]
                    // Zera o campo: escolher o mesmo arquivo de novo também importa.
                    event.target.value = ""
                    void readFile(file)
                }}
            />
            <ImportEnvTextDialog open={textOpen} onClose={() => setTextOpen(false)} onImport={onImport} />
        </>
    )
}
