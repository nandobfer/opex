"use client"

import { AlertTriangle, CheckCircle2, CircleDashed, Lock } from "lucide-react"
import { Input } from "@/components/ui/input"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import { Label } from "@/components/ui/label"
import { OptionTabs } from "@/components/ui/option-tabs"
import { cn } from "@/lib/utils"
import { ENV_COMPOSE_FIXED_KEYS, ENV_PROJECT_KEYS, ENV_URL_KEYS, type EnvEditableKey } from "../../../constants"
import { envHelp } from "../../../help/env-vars"
import { ENV_VALUE_SCHEMAS } from "../../../schemas/env"
import type { EnvEntryDto } from "../../../types"

const ENUMS: Partial<Record<EnvEditableKey, readonly string[]>> = {
    APP_ENV: ["development", "test", "staging", "production"],
    LITESTREAM_ENABLED: ["true", "false"],
    LOG_FORMAT: ["compact", "json"],
    LOG_ANSI: ["true", "false"],
}

interface EnvVarFieldProps {
    entry: EnvEntryDto
    value: string
    dirty: boolean
    onChange: (value: string) => void
}

/** Uma variável do `.env`: editável (validada por tipo), só gravar, só leitura ou fora do catálogo. */
export function EnvVarField({ entry, value, dirty, onChange }: EnvVarFieldProps) {
    const id = `env-${entry.key}`
    const editable = entry.kind === "editable"
    const schema = editable ? ENV_VALUE_SCHEMAS[entry.key as EnvEditableKey] : null
    const error = dirty && schema ? schema.safeParse(value).error?.issues[0]?.message : undefined
    const warning = ENV_COMPOSE_FIXED_KEYS.includes(entry.key)
        ? "O docker-compose.yml do Engramind fixa ou não repassa esta variável: o valor não chega ao container."
        : dirty && ENV_PROJECT_KEYS.includes(entry.key)
          ? "Ao aplicar, o projeto atual é derrubado e o serviço é recriado com o novo nome."
          : null
    const urlWarning = dirty && ENV_URL_KEYS.includes(entry.key) ? "A URL base da integração pode precisar de ajuste." : null
    const options = ENUMS[entry.key as EnvEditableKey]
    return (
        <div className={cn("space-y-1.5 rounded-lg border p-3", dirty && "border-primary/50 bg-primary/5")}>
            <div className="flex items-center gap-1.5">
                <Label htmlFor={id} className="font-mono text-xs font-semibold">
                    {entry.key}
                </Label>
                <InfoTooltip text={envHelp(entry.key)} label={entry.key} />
                {entry.kind === "read-only" && <Lock className="ml-auto h-3.5 w-3.5 text-muted-foreground" aria-label="Só leitura" />}
            </div>
            {entry.kind === "read-only" ? (
                <ConfiguredState configured={entry.configured === true} note="Só leitura: o Opex não lê nem edita este valor." />
            ) : entry.kind === "write-only" ? (
                <>
                    <Input id={id} type="password" autoComplete="new-password" value={value} placeholder={entry.configured ? "Configurada: vazio mantém a atual" : "Não configurada"} onChange={(event) => onChange(event.target.value)} />
                    <ConfiguredState configured={entry.configured === true} note="Só é gravada; o valor nunca sai do servidor." />
                </>
            ) : options ? (
                <OptionTabs id={id} aria-label={entry.key} size="sm" options={options.map((option) => ({ value: option, label: option }))} value={value} onChange={onChange} />
            ) : (
                <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} readOnly={!editable} className={cn(!editable && "text-muted-foreground")} />
            )}
            {error && (
                <p role="alert" className="text-xs text-destructive">
                    {error}
                </p>
            )}
            {(warning || urlWarning) && (
                <p className="flex items-start gap-1.5 text-[11px] text-warning">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {[warning, urlWarning].filter(Boolean).join(" ")}
                </p>
            )}
            {entry.kind === "unknown" && <p className="text-[11px] text-muted-foreground">Fora do catálogo: preservada como está.</p>}
        </div>
    )
}

function ConfiguredState({ configured, note }: { configured: boolean; note: string }) {
    return (
        <p className="flex items-center gap-1.5 text-xs">
            {configured ? <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden /> : <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
            <span>{configured ? "Configurada" : "Não configurada"}</span>
            <span className="text-muted-foreground">· {note}</span>
        </p>
    )
}
