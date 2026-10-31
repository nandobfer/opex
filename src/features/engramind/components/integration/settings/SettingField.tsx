"use client"

import { AnimatePresence, motion } from "framer-motion"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { settingHelp } from "../../../help/settings"
import { settingValueSchema } from "../../../schemas/settings"
import { formatDateTime, formatSettingValue } from "../../shared/format"
import { SettingControl, type SettingControlMeta } from "./SettingControl"

interface SettingFieldProps {
    meta: SettingControlMeta & { description: string; default: unknown; value?: unknown; updated_at?: string | null; updated_by_app?: string | null }
    value: unknown
    dirty: boolean
    onChange: (value: unknown) => void
    /** Texto extra do rodapé (ex.: valor global e sobreposição no canal). */
    extra?: string
    resetLabel?: string
    /** Rótulo do valor usado quando o rascunho é `null` ("Padrão"; no canal, "Global"). */
    defaultLabel?: string
    /** Esconde "Alterada em … por …" (configurações do canal). */
    hideHistory?: boolean
}

/** Uma configuração: rótulo com tooltip, controle, padrão, intervalo, última alteração e "Voltar ao padrão". */
export function SettingField({ meta, value, dirty, onChange, extra, resetLabel = "Voltar ao padrão", defaultLabel = "Padrão", hideHistory = false }: SettingFieldProps) {
    const help = settingHelp(meta.key, meta.description)
    const id = `setting-${meta.key.replace(/\W/g, "-")}`
    const error = value === null ? null : settingValueSchema(meta).safeParse(value).error?.issues[0]?.message ?? null
    const range = typeof meta.min === "number" || typeof meta.max === "number" ? `${meta.type === "categories" || meta.type === "list" ? "itens " : ""}${meta.min ?? "…"} a ${meta.max ?? "…"}` : null
    const wide = meta.type === "categories" || meta.key.endsWith("instructions")
    return (
        <div className={cn("space-y-1.5 rounded-lg border p-3 transition-colors", dirty && "border-primary/50 bg-primary/5", wide && "sm:col-span-2")}>
            <div className="flex items-center gap-1.5">
                <Label htmlFor={id} className="text-xs font-semibold">
                    {help.label}
                </Label>
                <InfoTooltip text={help.help} label={help.label} />
                <code className="ml-auto truncate font-mono text-[10px] text-muted-foreground">{meta.key}</code>
            </div>
            <SettingControl id={id} meta={meta} value={value === null ? meta.default : value} onChange={onChange} />
            <AnimatePresence initial={false}>
                {error && (
                    <motion.p key="error" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="text-xs text-destructive">
                        {error}
                    </motion.p>
                )}
            </AnimatePresence>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span>{defaultLabel}: {formatSettingValue(meta.default)}</span>
                {range && <span>Intervalo: {range}</span>}
                {!hideHistory && (meta.updated_at ? <span>Alterada em {formatDateTime(meta.updated_at)}{meta.updated_by_app ? ` por ${meta.updated_by_app}` : ""}</span> : <span>Valendo o padrão</span>)}
                {extra && <span>{extra}</span>}
                <Button type="button" variant="link" size="sm" className="ml-auto h-auto p-0 text-[11px]" onClick={() => onChange(null)} disabled={value === null}>
                    <RotateCcw className="mr-1 h-3 w-3" aria-hidden /> {resetLabel}
                </Button>
            </div>
        </div>
    )
}
