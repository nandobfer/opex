"use client"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { ChipInput } from "@/components/ui/chip-input"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { isCategoryList } from "../../../schemas/settings"
import { CategoriesEditor } from "./CategoriesEditor"
import { CategoryPrioritiesEditor } from "./CategoryPrioritiesEditor"
import { ScheduleSettingControl } from "./ScheduleSettingControl"

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
    /** Categorias atuais (rascunho de `categories.list`), para o mapa de prioridades. */
    categories?: readonly { key: string; label: string }[]
    /** Próxima execução do agendamento (`status.consolidation.next_run_at`). */
    nextRunAt?: string | null
}

/** Passo do campo numérico: inteiro 1; fração em 0,01 quando o intervalo cabe em 0–1. */
export function numberStep(meta: SettingControlMeta): number | "any" {
    if (meta.type === "integer") return 1
    return typeof meta.max === "number" && meta.max <= 1 ? 0.01 : "any"
}

/** Controle gerado do metadado da configuração (tipo, intervalo e opções). */
export function SettingControl({ id, meta, value, onChange, disabled, categories = [], nextRunAt }: SettingControlProps) {
    switch (meta.type) {
        case "boolean":
            return <Switch id={id} checked={value === true} onCheckedChange={(checked) => onChange(checked)} disabled={disabled} />
        case "integer":
        case "number":
            return (
                <Input
                    id={id}
                    type="number"
                    step={numberStep(meta)}
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
        case "cron":
            return <ScheduleSettingControl id={id} value={value} onChange={onChange} disabled={disabled} nextRunAt={nextRunAt} />
        case "map":
            return <CategoryPrioritiesEditor id={id} value={value} categories={categories} onChange={(next) => onChange(next)} disabled={disabled} />
        case "list":
            if (meta.choices?.length) {
                const selected = Array.isArray(value) ? (value as string[]) : []
                return (
                    <div id={id} className="flex flex-wrap gap-x-4 gap-y-2" data-testid="choice-list">
                        {meta.choices.map((choice) => (
                            <label key={choice} className="flex items-center gap-2 text-xs">
                                <Switch checked={selected.includes(choice)} aria-label={choice} onCheckedChange={(checked) => onChange(checked ? meta.choices!.filter((item) => item === choice || selected.includes(item)) : selected.filter((item) => item !== choice))} disabled={disabled} />
                                <span className="font-mono">{choice}</span>
                            </label>
                        ))}
                    </div>
                )
            }
            return <ChipInput id={id} aria-label={meta.key} value={Array.isArray(value) ? (value as string[]) : []} onChange={(next) => onChange(next)} max={meta.max ?? 5} placeholder="Digite e tecle Enter" disabled={disabled} />
        case "categories":
            return <CategoriesEditor id={id} value={isCategoryList(value) || Array.isArray(value) ? (value as never) : []} onChange={(next) => onChange(next)} />
        default:
            if (meta.key.endsWith("instructions"))
                return <Textarea id={id} rows={4} value={typeof value === "string" ? value : ""} placeholder="Padrão" onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)} disabled={disabled} />
            return <Input id={id} value={typeof value === "string" ? value : ""} placeholder="Padrão (vazio)" onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)} disabled={disabled} />
    }
}
