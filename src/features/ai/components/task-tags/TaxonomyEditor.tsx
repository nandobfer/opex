"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Plus, Tag, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { uniqueTagId, type TaskTagDef } from "@/features/tasks/tags"

interface TaxonomyEditorProps {
    value: TaskTagDef[]
    onChange: (next: TaskTagDef[]) => void
    disabled?: boolean
}

/**
 * Editor da **taxonomia fechada** de tags: adiciona (o id é o slug do rótulo, gerado uma vez e
 * imutável), renomeia o rótulo e remove. As tarefas guardam os ids, então renomear não quebra o
 * histórico — para trocar o id, remova e adicione de novo.
 */
export function TaxonomyEditor({ value, onChange, disabled }: TaxonomyEditorProps) {
    const [draft, setDraft] = useState("")

    const add = () => {
        const label = draft.trim()
        if (!label) return
        onChange([...value, { id: uniqueTagId(label, value.map((tag) => tag.id)), label }])
        setDraft("")
    }
    const rename = (index: number, label: string) => onChange(value.map((tag, i) => (i === index ? { ...tag, label } : tag)))
    const remove = (index: number) => onChange(value.filter((_, i) => i !== index))

    return (
        <div className="space-y-3">
            <ul className="space-y-2">
                <AnimatePresence initial={false}>
                    {value.map((tag, index) => (
                        <motion.li key={tag.id} layout initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.18 }} className="flex items-center gap-2">
                            <Tag className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                            <Input value={tag.label} disabled={disabled} onChange={(event) => rename(index, event.target.value)} aria-label={`Rótulo da tag ${tag.id}`} className="flex-1" />
                            <span className="hidden shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground sm:inline">{tag.id}</span>
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" disabled={disabled} onClick={() => remove(index)} aria-label={`Remover tag ${tag.label || tag.id}`}>
                                <X className="h-4 w-4" aria-hidden />
                            </Button>
                        </motion.li>
                    ))}
                </AnimatePresence>
            </ul>
            {value.length === 0 && <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Nenhuma tag na taxonomia. Adicione ao menos uma para a IA classificar as tarefas.</p>}
            <div className="flex items-center gap-2">
                <Input
                    value={draft}
                    disabled={disabled}
                    placeholder="Nova tag (ex.: Autenticação)"
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            event.preventDefault()
                            add()
                        }
                    }}
                    aria-label="Nova tag"
                    className="flex-1"
                />
                <Button type="button" variant="outline" className="shrink-0 gap-1.5" disabled={disabled || !draft.trim()} onClick={add}>
                    <Plus className="h-4 w-4" aria-hidden /> Adicionar
                </Button>
            </div>
        </div>
    )
}
