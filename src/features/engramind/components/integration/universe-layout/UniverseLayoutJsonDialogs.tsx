"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Check, Copy, Upload } from "lucide-react"
import { toast } from "sonner"
import { formatUniverseLayoutJson, parseUniverseLayoutJson, type UniverseLayoutConfig, type UniverseLayoutIssue } from "@engramind/client"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

/** Exportar: o JSON do que está no formulário (inclusive o não salvo), para copiar. */
export function UniverseLayoutExportDialog({ open, onOpenChange, values }: { open: boolean; onOpenChange: (open: boolean) => void; values: UniverseLayoutConfig }) {
    const [copied, setCopied] = useState(false)
    const text = formatUniverseLayoutJson(values)
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            toast.success("JSON copiado")
            setTimeout(() => setCopied(false), 1800)
        } catch {
            toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.")
        }
    }
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>Exportar visualização</DialogTitle>
                    <DialogDescription>O JSON dos valores que estão no formulário, salvos ou não. Cole-o em Importar para aplicar de novo.</DialogDescription>
                </DialogHeader>
                <Textarea vim={false} readOnly value={text} rows={14} aria-label="JSON da visualização" className="font-mono text-xs" onFocus={(event) => event.currentTarget.select()} />
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Fechar
                    </Button>
                    <Button type="button" onClick={() => void copy()}>
                        {copied ? <Check className="mr-2 h-4 w-4" aria-hidden /> : <Copy className="mr-2 h-4 w-4" aria-hidden />} Copiar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

/**
 * Importar: valida o JSON (chaves ausentes assumem o padrão) e o entrega ao formulário como alteração
 * pendente. JSON inválido lista os erros por campo e não altera nada.
 */
export function UniverseLayoutImportDialog({ open, onOpenChange, onImport }: { open: boolean; onOpenChange: (open: boolean) => void; onImport: (config: UniverseLayoutConfig) => void }) {
    const [text, setText] = useState("")
    const [errors, setErrors] = useState<UniverseLayoutIssue[]>([])
    const close = (next: boolean) => {
        if (!next) {
            setText("")
            setErrors([])
        }
        onOpenChange(next)
    }
    const apply = () => {
        const result = parseUniverseLayoutJson(text)
        if (!result.ok) return setErrors(result.errors)
        setErrors([])
        onImport(result.config)
        toast.success("Configuração importada. Revise e salve.")
        close(false)
    }
    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>Importar visualização</DialogTitle>
                    <DialogDescription>Cole o JSON exportado (ou só os campos que quer mudar; os ausentes assumem o padrão). Os valores entram no formulário como alteração pendente, e nada é gravado até você salvar.</DialogDescription>
                </DialogHeader>
                <Textarea
                    vim={false}
                    value={text}
                    rows={12}
                    placeholder='{ "layout": "rings", "ringGap": 84 }'
                    aria-label="JSON a importar"
                    aria-invalid={errors.length > 0}
                    className="font-mono text-xs"
                    onChange={(event) => {
                        setText(event.target.value)
                        setErrors([])
                    }}
                />
                <AnimatePresence initial={false}>
                    {errors.length > 0 && (
                        <motion.ul key="errors" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                            {errors.map((error, index) => (
                                <li key={`${error.path}-${index}`}>
                                    {error.path && <code className="mr-1 font-mono">{error.path}</code>}
                                    {error.message}
                                </li>
                            ))}
                        </motion.ul>
                    )}
                </AnimatePresence>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => close(false)}>
                        Cancelar
                    </Button>
                    <Button type="button" onClick={apply} disabled={text.trim() === ""}>
                        <Upload className="mr-2 h-4 w-4" aria-hidden /> Importar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
