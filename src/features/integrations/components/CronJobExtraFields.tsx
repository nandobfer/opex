"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { OptionTabs } from "@/components/ui/option-tabs"
import {
    CRON_JOB_SCOPE_OPTIONS,
    MADDOX_AGENT_SESSIONS_CLEANUP_JOB_ID,
    OPENCODE_SESSIONS_CLEANUP_JOB_ID,
    SESSION_RETENTION_DAYS_MAX,
    SESSION_RETENTION_DAYS_MIN,
    jobRetentionDays,
    jobSupportsRetentionDays,
    jobSupportsScope,
    type CronJobConfig,
    type CronJobScope,
} from "@/lib/integrations/catalog"

interface CronJobExtraFieldsProps {
    job: CronJobConfig
    onChange: (patch: Partial<CronJobConfig>) => void
    disabled?: boolean
}

/** Texto de ajuda da regra de cada rotina de limpeza de sessões. */
export function retentionHelp(jobId: string): string {
    if (jobId === OPENCODE_SESSIONS_CLEANUP_JOB_ID) {
        return "Exclui do OpenCode TODAS as sessões sem interação há esse número de dias, inclusive as suas pessoais (TUI/desktop). Nunca exclui as que estão rodando nem as vinculadas ao Opex (mesas, forks, refinamentos, revisões de PR, Agente Adversário e Agente Maddox)."
    }
    const agent = jobId === MADDOX_AGENT_SESSIONS_CLEANUP_JOB_ID ? "Agente Maddox" : "Agente Opex"
    return `Arquiva as sessões do ${agent} (dono e portal) sem interação há esse número de dias e exclui de vez as arquivadas há esse mesmo tempo. Sessões respondendo, aguardando confirmação ou com job ativo ficam de fora.`
}

/** Campos próprios de algumas rotinas internas: escopo (tags de concluídas) e dias sem interação (limpezas de sessões). */
export function CronJobExtraFields({ job, onChange, disabled }: CronJobExtraFieldsProps) {
    return (
        <>
            {jobSupportsScope(job.id) && (
                <div className="space-y-1.5">
                    <Label className="text-xs">Escopo</Label>
                    <OptionTabs<CronJobScope>
                        aria-label={`Escopo de ${job.label}`}
                        options={CRON_JOB_SCOPE_OPTIONS}
                        value={job.scope ?? "pending"}
                        onChange={(scope) => onChange({ scope })}
                        disabled={disabled}
                    />
                    <p className="text-xs text-muted-foreground">
                        “Só pendentes” marca apenas as tarefas sem tags ou com título/descrição alterados; “Todas” regenera as tags de todo o escopo.
                    </p>
                </div>
            )}
            {jobSupportsRetentionDays(job.id) && <RetentionDaysField job={job} onChange={onChange} disabled={disabled} />}
        </>
    )
}

/** Limita os dias à faixa aceita (vazio ou inválido = mínimo). */
export function clampRetentionDays(text: string): number {
    const n = Math.floor(Number(text) || SESSION_RETENTION_DAYS_MIN)
    return Math.min(SESSION_RETENTION_DAYS_MAX, Math.max(SESSION_RETENTION_DAYS_MIN, n))
}

/**
 * "Dias sem interação": o texto digitado fica em estado local (dá para apagar e digitar outro número);
 * só números inteiros válidos na faixa sobem durante a digitação, e o limite é aplicado ao sair do campo.
 */
function RetentionDaysField({ job, onChange, disabled }: CronJobExtraFieldsProps) {
    const saved = jobRetentionDays(job)
    // Rascunho só durante a edição; fora dela o campo mostra o valor salvo (reflete mudanças externas).
    const [draft, setDraft] = useState<string | null>(null)
    const text = draft ?? String(saved)
    return (
        <div className="space-y-1.5">
            <Label htmlFor={`cron-retention-${job.id}`} className="text-xs">
                Dias sem interação
            </Label>
            <Input
                id={`cron-retention-${job.id}`}
                type="number"
                min={SESSION_RETENTION_DAYS_MIN}
                max={SESSION_RETENTION_DAYS_MAX}
                step={1}
                className="w-full"
                value={text}
                onChange={(event) => {
                    const value = event.target.value
                    setDraft(value)
                    const n = Number(value)
                    if (value.trim() !== "" && Number.isInteger(n) && n >= SESSION_RETENTION_DAYS_MIN && n <= SESSION_RETENTION_DAYS_MAX) onChange({ retentionDays: n })
                }}
                onBlur={() => {
                    const n = clampRetentionDays(text)
                    setDraft(null)
                    if (n !== saved) onChange({ retentionDays: n })
                }}
                disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">{retentionHelp(job.id)}</p>
        </div>
    )
}
