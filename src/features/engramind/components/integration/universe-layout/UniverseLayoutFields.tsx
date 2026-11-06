"use client"

import type { ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { RotateCcw } from "lucide-react"
import { Controller, type Control, type FieldError, type FieldErrors } from "react-hook-form"
import { DEFAULT_UNIVERSE_LAYOUT, UNIVERSE_NUMBER_FIELDS, universeFieldLabel, type UniverseLayoutConfig, type UniverseNumberField } from "@engramind/client"
import { Button } from "@/components/ui/button"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { OptionTabs, type OptionTabsOption } from "@/components/ui/option-tabs"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { UNIVERSE_LAYOUT_HELP } from "../../../help/universe-layout"

type FieldName = keyof UniverseLayoutConfig

interface FieldBaseProps {
    name: FieldName
    control: Control<UniverseLayoutConfig>
    errors: FieldErrors<UniverseLayoutConfig>
    /** Valor gravado: o campo muda de cor quando o rascunho difere dele. */
    saved: UniverseLayoutConfig
    values: UniverseLayoutConfig
    onReset: (name: FieldName) => void
    /** Ocupa a linha inteira da grade. */
    wide?: boolean
}

const formatDefault = (name: FieldName): string => {
    const value = DEFAULT_UNIVERSE_LAYOUT[name]
    if (typeof value === "boolean") return value ? "ligado" : "desligado"
    const unit = name in UNIVERSE_NUMBER_FIELDS ? UNIVERSE_NUMBER_FIELDS[name as UniverseNumberField].unit : ""
    return `${String(value)}${unit ? ` ${unit}` : ""}`
}

/** Moldura de um campo: rótulo com tooltip, controle, erro, padrão, intervalo e "Voltar ao padrão". */
function FieldFrame({ name, values, saved, onReset, error, range, wide, children, htmlFor }: Pick<FieldBaseProps, "name" | "values" | "saved" | "onReset" | "wide"> & { error?: FieldError; range?: string; children: ReactNode; htmlFor: string }) {
    const label = universeFieldLabel(name)
    const dirty = values[name] !== saved[name]
    return (
        <div className={cn("space-y-1.5 rounded-lg border p-3 transition-colors", dirty && "border-primary/50 bg-primary/5", wide && "sm:col-span-2")} data-testid={`universe-field-${name}`}>
            <div className="flex items-center gap-1.5">
                <Label htmlFor={htmlFor} className="text-xs font-semibold">
                    {label}
                </Label>
                <InfoTooltip text={UNIVERSE_LAYOUT_HELP[name]} label={label} />
                <code className="ml-auto truncate font-mono text-[10px] text-muted-foreground">{name}</code>
            </div>
            {children}
            <AnimatePresence initial={false}>
                {error?.message && (
                    <motion.p key="error" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="text-xs text-destructive">
                        {error.message}
                    </motion.p>
                )}
            </AnimatePresence>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span>Padrão: {formatDefault(name)}</span>
                {range && <span>Intervalo: {range}</span>}
                <Button type="button" variant="link" size="sm" className="ml-auto h-auto p-0 text-[11px]" onClick={() => onReset(name)} disabled={values[name] === DEFAULT_UNIVERSE_LAYOUT[name]}>
                    <RotateCcw className="mr-1 h-3 w-3" aria-hidden /> Voltar ao padrão
                </Button>
            </div>
        </div>
    )
}

/** Campo numérico: intervalo, passo e unidade vêm da lib (os mesmos do schema que o servidor aplica). */
export function NumberLayoutField({ name, control, errors, ...rest }: FieldBaseProps & { name: UniverseNumberField }) {
    const spec: { min: number; max: number; step: number; unit: string } = UNIVERSE_NUMBER_FIELDS[name]
    const id = `universe-${name}`
    return (
        <Controller
            control={control}
            name={name}
            render={({ field }) => (
                <FieldFrame name={name} {...rest} htmlFor={id} error={errors[name] as FieldError | undefined} range={`${spec.min} a ${spec.max}${spec.unit ? ` ${spec.unit}` : ""}`}>
                    <div className="flex items-center gap-2">
                        <Input
                            id={id}
                            type="number"
                            inputMode="decimal"
                            step={spec.step}
                            min={spec.min}
                            max={spec.max}
                            value={Number.isFinite(field.value) ? (field.value as number) : ""}
                            onChange={(event) => field.onChange(event.target.value === "" ? Number.NaN : Number(event.target.value))}
                            onBlur={field.onBlur}
                            aria-invalid={Boolean(errors[name])}
                        />
                        {spec.unit && <span className="w-6 shrink-0 text-xs text-muted-foreground">{spec.unit}</span>}
                    </div>
                </FieldFrame>
            )}
        />
    )
}

/** Escolha entre poucas opções (`OptionTabs`). */
export function ChoiceLayoutField<T extends string>({ name, control, errors, options, ...rest }: FieldBaseProps & { options: readonly OptionTabsOption<T>[] }) {
    const id = `universe-${name}`
    return (
        <Controller
            control={control}
            name={name}
            render={({ field }) => (
                <FieldFrame name={name} {...rest} htmlFor={id} error={errors[name] as FieldError | undefined}>
                    <OptionTabs id={id} aria-label={universeFieldLabel(name)} options={options} value={field.value as T} onChange={(next) => field.onChange(next)} size="sm" />
                </FieldFrame>
            )}
        />
    )
}

/** Liga/desliga. */
export function SwitchLayoutField({ name, control, errors, ...rest }: FieldBaseProps) {
    const id = `universe-${name}`
    return (
        <Controller
            control={control}
            name={name}
            render={({ field }) => (
                <FieldFrame name={name} {...rest} htmlFor={id} error={errors[name] as FieldError | undefined}>
                    <Switch id={id} checked={field.value === true} onCheckedChange={(checked) => field.onChange(checked)} />
                </FieldFrame>
            )}
        />
    )
}
