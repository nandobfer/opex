"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { FileText, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { useFieldArray, type UseFormReturn } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { apiErrorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { OpexSkillFormValues } from "../../../skill-form-schemas"
import { useOpexSkillFile } from "../../../hooks/useOpexSkills"

const kb = (bytes: number) => `${(bytes / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB`

/** Carrega o texto de um arquivo existente para editar; falha mostra o erro e nada é alterado. */
function LoadFileButton({ skillId, path, onLoaded }: { skillId: string; path: string; onLoaded: (content: string) => void }) {
    const [asked, setAsked] = useState(false)
    const file = useOpexSkillFile(asked ? skillId : null, asked ? path : null)
    const loaded = useRef(onLoaded)
    useEffect(() => {
        loaded.current = onLoaded
    })
    const content = file.data?.content
    useEffect(() => {
        if (typeof content === "string") loaded.current(content)
    }, [content])
    return (
        <span className="flex items-center gap-2">
            {file.isError ? <span className="text-xs text-destructive">{apiErrorMessage(file.error, "Não foi possível ler o arquivo")}</span> : null}
            <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2" onClick={() => (file.isError ? void file.refetch() : setAsked(true))} disabled={file.isFetching}>
                {file.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Pencil className="h-3.5 w-3.5" aria-hidden />}
                {file.isError ? "Tentar novamente" : "Editar"}
            </Button>
        </span>
    )
}

/**
 * Arquivos de apoio da skill (opcionais): adicionar arquivo de texto, editar um existente (o conteúdo vem
 * sob demanda, para skill grande não travar o editor) e remover. Binários de repositório só são listados.
 */
export function OpexSkillFilesField({ form, skillId }: { form: UseFormReturn<OpexSkillFormValues>; skillId: string | null }) {
    const files = useFieldArray({ control: form.control, name: "files" })
    const errors = form.formState.errors.files
    const remove = (index: number) => {
        const file = form.getValues(`files.${index}`)
        if (file.existing) form.setValue("removed", [...form.getValues("removed"), file.path], { shouldDirty: true })
        files.remove(index)
    }
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
                <Label>Arquivos de apoio (opcional)</Label>
                <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => files.append({ path: "", content: "", existing: false, binary: false, size: 0 })}>
                    <Plus className="h-3.5 w-3.5" aria-hidden /> Arquivo
                </Button>
            </div>
            {files.fields.length === 0 ? <p className="text-xs text-muted-foreground">Referências, modelos ou scripts que as instruções citam (ex.: references/guia.md).</p> : null}
            <ul className="space-y-2">
                <AnimatePresence initial={false}>
                    {files.fields.map((field, index) => {
                        const value = form.watch(`files.${index}`)
                        const pathError = errors?.[index]?.path?.message
                        return (
                            <motion.li key={field.id} layout="position" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="space-y-2 rounded-md border p-3">
                                <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                                    {value.existing ? (
                                        <span className="min-w-0 flex-1 truncate font-mono text-sm">{value.path}</span>
                                    ) : (
                                        <Input aria-label="Caminho do arquivo" className={cn("h-8 flex-1 font-mono", pathError && "border-destructive")} placeholder="references/guia.md" {...form.register(`files.${index}.path`)} />
                                    )}
                                    {value.existing ? <span className="shrink-0 text-xs text-muted-foreground">{value.binary ? `binário · ${kb(value.size)}` : kb(value.size)}</span> : null}
                                    {value.existing && !value.binary && value.content === null && skillId ? (
                                        <LoadFileButton skillId={skillId} path={value.path} onLoaded={(content) => form.setValue(`files.${index}.content`, content, { shouldDirty: true })} />
                                    ) : null}
                                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label={`Remover ${value.path || "arquivo"}`} onClick={() => remove(index)}>
                                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                    </Button>
                                </div>
                                {pathError ? <p className="text-xs text-destructive">{pathError}</p> : null}
                                {value.content !== null ? <Textarea aria-label={`Conteúdo de ${value.path || "arquivo"}`} rows={6} className="font-mono text-xs" {...form.register(`files.${index}.content`)} /> : null}
                            </motion.li>
                        )
                    })}
                </AnimatePresence>
            </ul>
        </div>
    )
}
