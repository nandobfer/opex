"use client"

import type { ReactNode } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import type { z } from "zod"
import { Plus, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ColorPicker, type FavoriteColor } from "@/components/ui/color-picker"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { favoriteColorSchema } from "@/features/color-palette/schemas"
import { cn } from "@/lib/utils"
import { FAVORITE_FORM_GRID } from "./settings-layout"

type FormInput = z.input<typeof favoriteColorSchema>
export type FavoriteColorFormValues = z.output<typeof favoriteColorSchema>

interface FavoriteColorFormProps {
    /** `add`: limpa depois de enviar. `edit`: começa com `initial` e só envia quando algo mudou. */
    mode: "add" | "edit"
    /** Prefixo dos ids (a página tem o formulário de adicionar e o diálogo de editar ao mesmo tempo). */
    idPrefix: string
    favorites: readonly FavoriteColor[]
    initial?: FavoriteColor
    onSubmit: (values: FavoriteColorFormValues) => void
    /** Conteúdo extra abaixo dos campos (ex.: aviso de cor alterada no diálogo). Recebe a cor atual. */
    footer?: (color: string) => ReactNode
}

/** Cor (grade, favoritas ou hex) e nome opcional da favorita, com o mesmo schema da API. */
export function FavoriteColorForm({ mode, idPrefix, favorites, initial, onSubmit, footer }: FavoriteColorFormProps) {
    const empty = { color: initial?.color ?? "", name: initial?.name ?? "" }
    const form = useForm<FormInput, unknown, FavoriteColorFormValues>({ resolver: zodResolver(favoriteColorSchema), mode: "onChange", defaultValues: empty })
    const errors = form.formState.errors
    const color = useWatch({ control: form.control, name: "color" })
    // Na edição, a própria favorita não conta como repetida.
    const duplicated = color !== initial?.color && favorites.some((item) => item.color === color)
    // Sem cor escolhida ainda não é erro: o botão só fica desligado.
    const colorError = duplicated ? "Esta cor já está nas favoritas" : color ? errors.color?.message : undefined
    const blocked = !form.formState.isValid || duplicated || (mode === "edit" && !form.formState.isDirty)
    const colorId = `${idPrefix}-color`
    const nameId = `${idPrefix}-name`

    return (
        <form
            className={cn(mode === "add" ? FAVORITE_FORM_GRID : "space-y-4")}
            onSubmit={form.handleSubmit((values) => {
                onSubmit(values)
                if (mode === "add") form.reset({ color: "", name: "" })
            })}
        >
            <Field id={colorId} label="Cor" error={colorError}>
                <Controller
                    control={form.control}
                    name="color"
                    render={({ field }) => <ColorPicker id={colorId} value={field.value || null} onChange={(next) => field.onChange(next ?? "")} favorites={favorites} />}
                />
            </Field>
            <Field id={nameId} label="Nome (opcional)" error={errors.name?.message}>
                <Input id={nameId} placeholder="Ex.: Roxo Opex" {...form.register("name")} aria-invalid={errors.name ? true : undefined} />
            </Field>
            {footer?.(color)}
            <Button type="submit" disabled={blocked} className={cn(mode === "edit" && "w-full")}>
                {mode === "add" ? <Plus className="h-4 w-4" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                {mode === "add" ? "Adicionar" : "Salvar"}
            </Button>
        </form>
    )
}
