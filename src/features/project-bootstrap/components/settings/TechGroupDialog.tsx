"use client"

import { useEffect } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ColorPaletteField } from "@/features/color-palette/components/ColorPaletteField"
import { useSaveTechGroup } from "../../hooks/useProjectBootstrap"
import { techGroupInputSchema, type TechGroupInput } from "../../schemas"
import type { TechGroupDto } from "../../types"

const EMPTY: TechGroupInput = { name: "", color: "#8000FF" }

/** Criar ou renomear um grupo do catálogo e escolher a cor pelo seletor de cores do Opex. */
export function TechGroupDialog({ open, group, onClose }: { open: boolean; group: TechGroupDto | null; onClose: () => void }) {
    const save = useSaveTechGroup()
    const form = useForm<TechGroupInput>({ resolver: zodResolver(techGroupInputSchema), mode: "onChange", defaultValues: EMPTY })
    useEffect(() => {
        if (open) form.reset(group ? { name: group.name, color: group.color } : EMPTY)
    }, [open, group, form])
    const errors = form.formState.errors
    return (
        <Dialog open={open} onOpenChange={(next) => !next && !save.isPending && onClose()}>
            <DialogContent className="sm:max-w-md">
                <form
                    className="space-y-5"
                    onSubmit={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        void form.handleSubmit(async (values) => {
                            const saved = await save.mutateAsync({ ...values, id: group?.id ?? null }).catch(() => null)
                            if (saved) onClose()
                        })()
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>{group ? `Editar o grupo ${group.name}` : "Novo grupo"}</DialogTitle>
                        <DialogDescription>Os badges das tecnologias do grupo usam esta cor.</DialogDescription>
                    </DialogHeader>
                    <Field id="tech-group-name" label="Nome" error={errors.name?.message}>
                        <Input id="tech-group-name" placeholder="Ex.: Banco de dados" {...form.register("name")} aria-invalid={errors.name ? true : undefined} />
                    </Field>
                    <Field id="tech-group-color" label="Cor" error={errors.color?.message}>
                        <Controller control={form.control} name="color" render={({ field }) => <ColorPaletteField id="tech-group-color" value={field.value} onChange={(color) => field.onChange(color ?? EMPTY.color)} />} />
                    </Field>
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={onClose} disabled={save.isPending}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={save.isPending || !form.formState.isValid}>
                            {save.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                            Salvar
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
