"use client"

import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { MapPin, SendHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { chatLocationSchema, type ChatSendInput } from "@/features/evolution-api/schemas"
import { parseCoordinates } from "../../../chat-timeline"

type LocationInput = Extract<ChatSendInput, { type: "location" }>

/** Formulário do diálogo: nome e endereço com as regras da rota; coordenadas digitadas ou pelo link do Google Maps. */
const locationFormSchema = z.object({
    name: chatLocationSchema.shape.name,
    address: chatLocationSchema.shape.address,
    coordinates: z.string().trim().min(1, "Informe as coordenadas ou cole o link do Google Maps").refine((value) => parseCoordinates(value) !== null, "Use \"latitude, longitude\" ou um link do Google Maps com o ponto"),
})
type LocationForm = z.input<typeof locationFormSchema>
const EMPTY: LocationForm = { name: "", address: "", coordinates: "" }

/**
 * Enviar localização (sem as filiais do Atendimento, que são do CRM): nome, endereço e o ponto. Sem `<form>`: as abas
 * de Integrações › IA ficam dentro do formulário do editor.
 */
export function LocationDialog({ open, onOpenChange, onSend }: { open: boolean; onOpenChange: (open: boolean) => void; onSend: (input: LocationInput) => void }) {
    const form = useForm<LocationForm>({ resolver: zodResolver(locationFormSchema), defaultValues: EMPTY, mode: "onChange" })
    const { register, formState, reset, handleSubmit } = form
    useEffect(() => {
        if (open) reset(EMPTY)
    }, [open, reset])
    const submit = handleSubmit((values) => {
        const point = parseCoordinates(values.coordinates)
        if (!point) return
        onSend({ type: "location", ...point, name: values.name?.trim() || undefined, address: values.address?.trim() || undefined })
        onOpenChange(false)
    })
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <MapPin className="h-5 w-5 text-primary" aria-hidden /> Enviar localização
                    </DialogTitle>
                    <DialogDescription>Informe o ponto. O contato recebe o local para abrir no mapa.</DialogDescription>
                </DialogHeader>
                <div className={FORM_GRID}>
                    <Field id="location-name" label="Nome do local" error={formState.errors.name?.message}>
                        <Input id="location-name" placeholder="Ex.: Escritório" {...register("name")} />
                    </Field>
                    <Field id="location-address" label="Endereço" error={formState.errors.address?.message}>
                        <Input id="location-address" placeholder="Rua, número, cidade" {...register("address")} />
                    </Field>
                    <Field id="location-coordinates" label="Coordenadas ou link do Google Maps" error={formState.errors.coordinates?.message}>
                        <Input id="location-coordinates" placeholder="-19.9167, -43.9345" {...register("coordinates")} />
                    </Field>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button type="button" disabled={!formState.isValid} onClick={() => void submit()}>
                        <SendHorizontal aria-hidden /> Enviar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
