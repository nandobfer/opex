"use client"

import { useEffect } from "react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { FormNumberInput } from "@/components/ui/number-field"
import { ToggleCard } from "@/components/ui/toggle-card"
import { useSaveEnvironmentsBuilder } from "../../hooks/useEnvironmentsBuilder"
import { environmentsBuilderSchema, type EnvironmentsBuilder } from "../../schemas"
import type { EnvironmentsBuilderDto } from "../../types"

/**
 * Gerenciar/Editar o builder do servidor: nome, limites (vazio = sem limite) e opções. Abre com a
 * configuração salva ou, sem ela, com o que o host tem hoje.
 */
export function BuilderFormDialog({ open, builder, onClose }: { open: boolean; builder: EnvironmentsBuilderDto; onClose: () => void }) {
    const save = useSaveEnvironmentsBuilder()
    const form = useForm<EnvironmentsBuilder>({ resolver: zodResolver(environmentsBuilderSchema), mode: "onChange", defaultValues: builder.suggested })
    useEffect(() => {
        if (open) form.reset(builder.suggested)
        // Só ao abrir: a consulta a cada 10 s não pode desfazer o que o dono está digitando.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, form])
    const errors = form.formState.errors
    const host = builder.host
    const submit = form.handleSubmit((values) => save.mutate(values, { onSuccess: onClose }))
    return (
        <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
            <DialogContent>
                <form onSubmit={(event) => void submit(event)} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>{builder.managed ? "Builder do servidor" : "Gerenciar o builder do servidor"}</DialogTitle>
                        <DialogDescription>
                            Os deploys com build no servidor usam este builder. Mudar os limites recria o builder com --keep-state (o cache é mantido); com um build em andamento, os limites entram na hora e a recriação espera o build terminar.
                        </DialogDescription>
                    </DialogHeader>
                    <div className={FORM_GRID}>
                        <Field id="environments-builder-name" label="Nome do builder" error={errors.name?.message}>
                            <Input id="environments-builder-name" className="font-mono" {...form.register("name")} />
                        </Field>
                        <Field id="environments-builder-memory" label="RAM máxima (GiB)" error={errors.memoryGb?.message}>
                            <FormNumberInput control={form.control} name="memoryGb" id="environments-builder-memory" nullable step={0.5} min={0.5} max={host?.memoryGb} placeholder="Sem limite" />
                            <p className="text-xs text-muted-foreground">Vazio = sem limite{host ? `; o servidor tem ${host.memoryGb.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GiB` : ""}</p>
                        </Field>
                        <Field id="environments-builder-swap" label="Swap além da RAM (GiB)" error={errors.swapGb?.message}>
                            <FormNumberInput control={form.control} name="swapGb" id="environments-builder-swap" nullable step={0.5} min={0} placeholder="Padrão do Docker" />
                            <p className="text-xs text-muted-foreground">Vazio = padrão do Docker (igual à RAM); 0 = sem swap. Exige a RAM</p>
                        </Field>
                        <Field id="environments-builder-cpus" label="CPUs" error={errors.cpus?.message}>
                            <FormNumberInput control={form.control} name="cpus" id="environments-builder-cpus" nullable step={0.5} min={0.1} max={host?.cpus} placeholder="Sem limite" />
                            <p className="text-xs text-muted-foreground">Vazio = sem limite; aceita fração (ex.: 2.5){host ? `; o servidor tem ${host.cpus}` : ""}</p>
                        </Field>
                    </div>
                    <Controller
                        control={form.control}
                        name="useAsDefault"
                        render={({ field }) => (
                            <ToggleCard id="environments-builder-default" checked={field.value} onCheckedChange={field.onChange} label="Builder padrão do host" description="Marca como o builder atual do buildx (--use): as prévias das mesas também o usam" onLabel="Sim" offLabel="Não" />
                        )}
                    />
                    <Controller
                        control={form.control}
                        name="allowNetworkHost"
                        render={({ field }) => (
                            <ToggleCard id="environments-builder-network-host" checked={field.value} onCheckedChange={field.onChange} label="Permitir network=host no build" description="Flag do BuildKit --allow-insecure-entitlement=network.host" onLabel="Sim" offLabel="Não" />
                        )}
                    />
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={save.isPending || !form.formState.isValid}>
                            Salvar
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
