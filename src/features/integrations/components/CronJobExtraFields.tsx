"use client"

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
            {jobSupportsRetentionDays(job.id) && (
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
                        value={jobRetentionDays(job)}
                        onChange={(event) => {
                            const n = Math.floor(Number(event.target.value) || SESSION_RETENTION_DAYS_MIN)
                            onChange({ retentionDays: Math.min(SESSION_RETENTION_DAYS_MAX, Math.max(SESSION_RETENTION_DAYS_MIN, n)) })
                        }}
                        disabled={disabled}
                    />
                    <p className="text-xs text-muted-foreground">{retentionHelp(job.id)}</p>
                </div>
            )}
        </>
    )
}
