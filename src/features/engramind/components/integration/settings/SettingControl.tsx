"use client"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { ChipInput } from "@/components/ui/chip-input"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { isCategoryList } from "../../../schemas/settings"
import { CategoriesEditor } from "./CategoriesEditor"

const NONE = "__default__"

export interface SettingControlMeta {
    key: string
    type: string
    choices?: string[] | null
    min?: number | null
    max?: number | null
}

interface SettingControlProps {
    id: string
    meta: SettingControlMeta
    /** Valor do rascunho; `null` = padrão. */
    value: unknown
    onChange: (value: unknown) => void
    disabled?: boolean
}

/** Controle gerado do metadado da configuração (tipo, intervalo e opções). */
export function SettingControl({ id, meta, value, onChange, disabled }: SettingControlProps) {
    switch (meta.type) {
        case "boolean":
            return <Switch id={id} checked={value === true} onCheckedChange={(checked) => onChange(checked)} disabled={disabled} />
        case "integer":
        case "number":
            return (
                <Input
                    id={id}
                    type="number"
                    step={meta.type === "integer" ? 1 : "any"}
                    min={meta.min ?? undefined}
                    max={meta.max ?? undefined}
                    value={typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" ? value : ""}
                    placeholder="Padrão"
                    onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))}
                    disabled={disabled}
                />
            )
        case "enum": {
            const choices = meta.choices ?? []
            if (choices.length > 0 && choices.length <= 4)
                return <OptionTabs id={id} aria-label={meta.key} options={choices.map((choice) => ({ value: choice, label: choice }))} value={typeof value === "string" ? value : ""} onChange={(next) => onChange(next)} disabled={disabled} />
            return (
                <Select value={typeof value === "string" ? value : NONE} onValueChange={(next) => onChange(next === NONE ? null : next)} disabled={disabled}>
                    <SelectTrigger id={id} className="bg-transparent">
                        <SelectValue placeholder="Padrão" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={NONE}>Padrão</SelectItem>
                        {choices.map((choice) => (
                            <SelectItem key={choice} value={choice}>
                                {choice}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )
        }
        case "list":
            return <ChipInput id={id} aria-label={meta.key} value={Array.isArray(value) ? (value as string[]) : []} onChange={(next) => onChange(next)} max={meta.max ?? 5} placeholder="Digite e tecle Enter" disabled={disabled} />
        case "categories":
            return <CategoriesEditor id={id} value={isCategoryList(value) || Array.isArray(value) ? (value as never) : []} onChange={(next) => onChange(next)} />
        default:
            if (meta.key.endsWith("instructions"))
                return <Textarea id={id} rows={4} value={typeof value === "string" ? value : ""} placeholder="Padrão" onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)} disabled={disabled} />
            return <Input id={id} value={typeof value === "string" ? value : ""} placeholder="Padrão (vazio)" onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)} disabled={disabled} />
    }
}
