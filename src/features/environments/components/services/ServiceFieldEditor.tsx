"use client"

import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { KeyValueRows } from "@/components/ui/key-value-rows"
import { OptionTabs } from "@/components/ui/option-tabs"
import { RESTART_POLICIES, type ServiceField, type ServiceValues } from "../../schemas"
import { ArgsField } from "./ArgsField"
import { DependsOnField } from "./DependsOnField"
import { HealthcheckField } from "./HealthcheckField"
import { PortsField } from "./PortsField"
import { VolumesField } from "./VolumesField"

const RESTART_LABELS: Record<(typeof RESTART_POLICIES)[number], string> = { no: "Nunca", always: "Sempre", "on-failure": "Se falhar", "unless-stopped": "Até ser parado" }
const RESTART_OPTIONS = RESTART_POLICIES.map((value) => ({ value, label: RESTART_LABELS[value], title: `restart: ${value}` }))

interface Props<F extends ServiceField> {
    id: string
    service: string
    field: F
    value: NonNullable<ServiceValues[F]>
    onChange: (value: NonNullable<ServiceValues[F]>) => void
    /** Outros serviços do compose (dependências). */
    services: string[]
}

/** Editor de um campo personalizado do serviço (OPE-211). */
export function ServiceFieldEditor<F extends ServiceField>({ id, service, field, value, onChange, services }: Props<F>) {
    const set = onChange as (value: unknown) => void
    switch (field) {
        case "image":
            return <Input id={id} aria-label={`Imagem de ${service}`} className="font-mono" placeholder="nginx:1.27" value={value as string} onChange={(event) => set(event.target.value)} />
        case "command":
        case "entrypoint":
            return <ArgsField id={id} label={`${field} de ${service}`} value={value as string[]} onChange={set} />
        case "environment":
        case "labels": {
            const rows = value as ServiceValues["environment"] & object
            const label = field === "environment" ? "variável do environment" : "label"
            return (
                <div className="space-y-2">
                    <KeyValueRows rows={rows} onChange={set} itemLabel={label} article={field === "labels" ? "o" : "a"} keyPlaceholder={field === "labels" ? "nome.do.label" : "NOME"} />
                    {!rows.length && <p className="text-xs text-muted-foreground">{field === "environment" ? "Nenhuma variável (a lista vazia tira o environment do compose)." : "Nenhum label (a lista vazia tira os labels do compose)."}</p>}
                    <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => set([...rows, { key: "", value: "" }])}>
                        <Plus className="h-4 w-4" aria-hidden /> {field === "environment" ? "Adicionar variável" : "Adicionar label"}
                    </Button>
                </div>
            )
        }
        case "ports":
            return <PortsField value={value as ServiceValues["ports"] & object} onChange={set} />
        case "volumes":
            return <VolumesField value={value as ServiceValues["volumes"] & object} onChange={set} />
        case "restart":
            return <OptionTabs id={id} aria-label={`Restart de ${service}`} options={RESTART_OPTIONS} value={value as (typeof RESTART_POLICIES)[number]} onChange={set} className="w-full" />
        case "healthcheck":
            return <HealthcheckField id={id} value={value as NonNullable<ServiceValues["healthcheck"]>} onChange={set} />
        case "dependsOn":
            return <DependsOnField value={value as ServiceValues["dependsOn"] & object} onChange={set} services={services.filter((name) => name !== service)} />
        default:
            return null
    }
}
