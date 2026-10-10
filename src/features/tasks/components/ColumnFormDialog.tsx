"use client"

import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Check, Loader2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { COLUMN_COLOR_STYLES, COLUMN_COLORS, COLUMN_ICON_KEYS, type TaskColumnDto } from "../board"
import { columnInputSchema, type ColumnInput } from "../schemas"
import { COLUMN_ICONS, ColumnIconView } from "./column-icons"

interface ColumnFormDialogProps {
    open: boolean
    /** Coluna em edição; `null` = nova. */
    column: TaskColumnDto | null
    submitting: boolean
    onSubmit: (values: ColumnInput) => Promise<void> | void
    onClose: () => void
}

const EMPTY: ColumnInput = { name: "", color: "violet", icon: "star", description: "", wipLimit: null }

const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()

/** Criar/editar coluna do quadro: nome, cor, ícone, descrição e limite (WIP). */
export function ColumnFormDialog({ open, column, submitting, onSubmit, onClose }: ColumnFormDialogProps) {
    const form = useForm<ColumnInput>({ resolver: zodResolver(columnInputSchema), mode: "onChange", defaultValues: EMPTY })
    const [iconSearch, setIconSearch] = useState("")

    useEffect(() => {
        if (!open) return
        form.reset(column ? { name: column.name, color: column.color, icon: column.icon, description: column.description ?? "", wipLimit: column.wipLimit } : EMPTY)
    }, [open, column, form])

    const close = () => {
        setIconSearch("")
        onClose()
    }

    const icons = useMemo(() => {
        const term = normalize(iconSearch.trim())
        return COLUMN_ICON_KEYS.filter((key) => !term || normalize(COLUMN_ICONS[key].label).includes(term) || key.includes(term))
    }, [iconSearch])

    const [color, icon, name] = useWatch({ control: form.control, name: ["color", "icon", "name"] })
    const errors = form.formState.errors

    return (
        <Dialog open={open} onOpenChange={(next) => !next && !submitting && close()}>
            <DialogContent className="sm:max-w-xl">
                <form
                    className="space-y-5"
                    onSubmit={form.handleSubmit(async (values) => {
                        await onSubmit(values)
                        setIconSearch("")
                    })}
                >
                    <DialogHeader>
                        <DialogTitle>{column ? "Editar coluna" : "Nova coluna"}</DialogTitle>
                        <DialogDescription>Coluna do quadro: organiza suas tarefas. Mover uma tarefa para cá é só uma mudança de coluna.</DialogDescription>
                    </DialogHeader>

                    <motion.div layout className={cn("flex items-center gap-2 rounded-lg border border-t-4 bg-muted/40 px-3 py-2", COLUMN_COLOR_STYLES[color].border)} aria-hidden>
                        <ColumnIconView icon={icon} className="h-4 w-4 text-muted-foreground" />
                        <span className="truncate text-xs font-semibold uppercase tracking-wide">{name.trim() || "Nome da coluna"}</span>
                        <span className="ml-auto rounded border px-1 py-px text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Coluna</span>
                    </motion.div>

                    <div className={FORM_GRID}>
                        <Field id="column-name" label="Nome" error={errors.name?.message}>
                            <Input id="column-name" autoFocus placeholder="Ex.: Aguardando cliente" {...form.register("name")} aria-invalid={errors.name ? true : undefined} />
                        </Field>
                        <Field id="column-wip" label="Limite de tarefas (opcional)" error={errors.wipLimit?.message}>
                            <Input
                                id="column-wip"
                                type="number"
                                min={1}
                                max={999}
                                placeholder="Sem limite"
                                {...form.register("wipLimit", { setValueAs: (value: unknown) => (value === "" || value === null || value === undefined ? null : Number(value)) })}
                                aria-invalid={errors.wipLimit ? true : undefined}
                            />
                        </Field>
                    </div>

                    <Field id="column-color" label="Cor">
                        <Controller
                            control={form.control}
                            name="color"
                            render={({ field }) => (
                                <div role="radiogroup" aria-label="Cor" className="flex flex-wrap gap-2">
                                    {COLUMN_COLORS.map((value) => (
                                        <motion.button
                                            key={value}
                                            type="button"
                                            role="radio"
                                            aria-checked={field.value === value}
                                            aria-label={COLUMN_COLOR_STYLES[value].label}
                                            title={COLUMN_COLOR_STYLES[value].label}
                                            whileTap={{ scale: 0.9 }}
                                            onClick={() => field.onChange(value)}
                                            className={cn(
                                                "flex h-7 w-7 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-shadow",
                                                COLUMN_COLOR_STYLES[value].swatch,
                                                field.value === value && "ring-2 ring-foreground",
                                            )}
                                        >
                                            {field.value === value && <Check className="h-3.5 w-3.5 text-white" aria-hidden />}
                                        </motion.button>
                                    ))}
                                </div>
                            )}
                        />
                    </Field>

                    <Field id="column-icon-search" label="Ícone">
                        <div className="space-y-2">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground opacity-60" aria-hidden />
                                <Input id="column-icon-search" placeholder="Buscar ícone..." value={iconSearch} onChange={(event) => setIconSearch(event.target.value)} className="h-9 pl-8" />
                            </div>
                            <Controller
                                control={form.control}
                                name="icon"
                                render={({ field }) => (
                                    <div role="radiogroup" aria-label="Ícone" className="grid max-h-[132px] grid-cols-8 gap-1 overflow-y-auto">
                                        {icons.length === 0 && <p className="col-span-8 py-3 text-center text-xs text-muted-foreground">Nenhum ícone encontrado</p>}
                                        {icons.map((key) => (
                                            <button
                                                key={key}
                                                type="button"
                                                role="radio"
                                                aria-checked={field.value === key}
                                                aria-label={COLUMN_ICONS[key].label}
                                                title={COLUMN_ICONS[key].label}
                                                onClick={() => field.onChange(key)}
                                                className={cn(
                                                    "flex h-9 items-center justify-center rounded-md border transition-colors hover:border-primary hover:text-primary",
                                                    field.value === key ? "border-primary bg-primary/15 text-primary" : "text-muted-foreground",
                                                )}
                                            >
                                                <ColumnIconView icon={key} className="h-4 w-4" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            />
                        </div>
                    </Field>

                    <Field id="column-description" label="Descrição (opcional)" error={errors.description?.message}>
                        <Textarea id="column-description" rows={2} placeholder="Aparece ao passar o mouse no cabeçalho da coluna" {...form.register("description")} />
                    </Field>

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={close} disabled={submitting}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={submitting || !form.formState.isValid}>
                            {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                            {column ? "Salvar" : "Criar coluna"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
