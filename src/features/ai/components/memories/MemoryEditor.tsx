"use client"

import { useId, useMemo } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Save, X } from "lucide-react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { DEFAULT_MEMORY_TEXT_LIMITS, memoryTextSchema, type MemoryTextLimits } from "../../memory-text"

interface MemoryEditorProps {
    label: string
    initial?: { texto: string; categoria: string | null }
    limits?: MemoryTextLimits
    categories: { key: string; label: string }[]
    onSave: (values: { texto: string; categoria: string }) => void
    onCancel: () => void
}

/** Schema do editor: texto nos limites do Engramind e categoria da lista `categories.list`. */
export function memoryEditorSchema(limits: MemoryTextLimits, categories: readonly { key: string }[]) {
    const keys = categories.map((item) => item.key)
    return z.object({
        texto: memoryTextSchema(limits),
        categoria: keys.length ? z.string().refine((value) => keys.includes(value), "Categoria inválida: escolha uma da lista") : z.string(),
    })
}

/** Texto livre da memória + categoria (mesmos limites da API, vindos do Engramind). Ctrl+Enter salva, Esc cancela. */
export function MemoryEditor({ label, initial, limits = DEFAULT_MEMORY_TEXT_LIMITS, categories, onSave, onCancel }: MemoryEditorProps) {
    const id = useId()
    const schema = useMemo(() => memoryEditorSchema(limits, categories), [limits, categories])
    const startCategory = initial?.categoria ?? categories[0]?.key ?? ""
    const form = useForm<{ texto: string; categoria: string }>({ resolver: zodResolver(schema), mode: "onChange", defaultValues: { texto: initial?.texto ?? "", categoria: startCategory } })
    const texto = useWatch({ control: form.control, name: "texto" }) ?? ""
    const categoria = useWatch({ control: form.control, name: "categoria" }) ?? ""
    const error = form.formState.errors.texto?.message
    const categoryError = form.formState.errors.categoria?.message ?? (categoria && categories.length && !categories.some((item) => item.key === categoria) ? "Categoria inválida: escolha uma da lista" : undefined)
    const isValid = form.formState.isValid
    const unchanged = initial ? texto.trim() === initial.texto.trim() && categoria === (initial.categoria ?? "") : false
    const submit = form.handleSubmit((values) => onSave(values))
    return (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <label htmlFor={id} className="text-sm font-medium">
                {label}
            </label>
            <Textarea
                id={id}
                rows={4}
                autoFocus
                placeholder="Escreva a instrução ou o fato que o agente deve lembrar. O Redator do Engramind gera o resumo da lista."
                aria-invalid={Boolean(error)}
                {...form.register("texto")}
                onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                        event.preventDefault()
                        void submit()
                    }
                    if (event.key === "Escape") onCancel()
                }}
            />
            {categories.length > 0 && (
                <div className="space-y-1">
                    <Label htmlFor={`${id}-categoria`} className="text-xs font-semibold">
                        Categoria
                    </Label>
                    <Select value={categories.some((item) => item.key === categoria) ? categoria : undefined} onValueChange={(next) => form.setValue("categoria", next, { shouldDirty: true, shouldValidate: true })}>
                        <SelectTrigger id={`${id}-categoria`} className="w-full bg-transparent" aria-invalid={Boolean(categoryError)}>
                            <SelectValue placeholder={categoria ? `${categoria} (inválida)` : "Escolha a categoria"} />
                        </SelectTrigger>
                        <SelectContent>
                            {categories.map((item) => (
                                <SelectItem key={item.key} value={item.key}>
                                    {item.label} ({item.key})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {categoryError && (
                        <p role="alert" className="text-xs text-destructive">
                            {categoryError}
                        </p>
                    )}
                </div>
            )}
            <div className="flex items-center justify-between gap-2 text-xs">
                <span className={error ? "text-destructive" : "text-muted-foreground"} data-testid="memory-editor-counter">
                    {error ?? `${texto.length}/${limits.textMax}`}
                </span>
                <div className="flex gap-2">
                    <Button type="button" size="sm" variant="ghost" className="gap-1" onClick={onCancel}>
                        <X className="h-4 w-4" aria-hidden /> Cancelar
                    </Button>
                    <Button type="button" size="sm" className="gap-1" disabled={!isValid || Boolean(categoryError) || unchanged} onClick={() => void submit()}>
                        <Save className="h-4 w-4" aria-hidden /> Salvar
                    </Button>
                </div>
            </div>
        </div>
    )
}
