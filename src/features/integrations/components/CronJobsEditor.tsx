"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AlertCircle, CheckCircle2, Clock, Cog, Globe, Loader2, Play, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { CRON_JOB_SCOPE_OPTIONS, jobSupportsScope, type CronJobConfig, type CronJobScope } from "@/lib/integrations/catalog"
import { formatLogTimestamp } from "@/lib/integrations/log-format"
import { integrationErrorMessage, useRunCronJob } from "../hooks/useIntegrations"
import type { CronJobStateDto } from "../types"
import { ScheduleEditor } from "./ScheduleEditor"

interface CronJobsEditorProps {
    value: CronJobConfig[]
    onChange: (value: CronJobConfig[]) => void
    states?: CronJobStateDto[]
    disabled?: boolean
    /** Rotinas como estão salvas: "Executar agora" roda a versão salva, então exige rotina sem alterações. */
    savedJobs?: CronJobConfig[]
    /** `integrations.crons.run`. */
    canRun?: boolean
}

/** Motivo para "Executar agora" estar indisponível, ou `null` quando pode executar. */
export function runNowBlockReason(
    job: CronJobConfig,
    savedJobs: CronJobConfig[],
    canRun: boolean,
    running: boolean,
): string | null {
    if (!canRun) return "Sem permissão para executar rotinas"
    if (running) return "A rotina já está em execução"
    const saved = savedJobs.find((candidate) => candidate.id === job.id)
    if (!saved || JSON.stringify(saved) !== JSON.stringify(job)) return "Salve as alterações antes de executar"
    return null
}

function RunNowButton({ label, blockReason, pending, onClick }: { label: string; blockReason: string | null; pending: boolean; onClick: () => void }) {
    const button = (
        <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={onClick}
            disabled={pending || blockReason !== null}
            aria-label={`Executar agora: ${label}`}
        >
            {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
            Executar agora
        </Button>
    )
    if (!blockReason || pending) return button
    // Botão desabilitado não dispara eventos de ponteiro: o tooltip fica no wrapper.
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span tabIndex={0} className="inline-flex" data-testid="run-now-blocked">
                        {button}
                    </span>
                </TooltipTrigger>
                <TooltipContent>{blockReason}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}

function slugify(text: string): string {
    return text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60)
}

function formatDate(iso?: string): string {
    return iso ? formatLogTimestamp(iso).slice(0, 16) : "—"
}

function JobStatus({ state, enabled, manualRunning }: { state?: CronJobStateDto; enabled: boolean; manualRunning?: boolean }) {
    if (state?.running || manualRunning) {
        return (
            <span className="flex items-center gap-1 text-xs text-sky-600">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Executando
            </span>
        )
    }
    if (!enabled) {
        return (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                Desativada
                {state?.lastRunAt && <LastRun state={state} />}
            </span>
        )
    }
    return (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> Próxima: {formatDate(state?.nextRunAt)}
            </span>
            {state?.lastRunAt && <LastRun state={state} />}
        </span>
    )
}

function LastRun({ state }: { state: CronJobStateDto }) {
    return (
        <span
            className={cn("flex items-center gap-1", state.lastStatus === "error" ? "text-destructive" : "text-emerald-600")}
            title={state.lastError ?? undefined}
        >
            {state.lastStatus === "error" ? <AlertCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Última: {formatDate(state.lastRunAt)}
            {state.lastDurationMs != null && ` · ${state.lastDurationMs} ms`}
        </span>
    )
}

/**
 * Lista das rotinas do agendador. Rotinas HTTP chamam uma rota da própria aplicação; rotinas
 * internas (ex.: verificação de status) só têm agendamento e podem ser desativadas.
 */
export function CronJobsEditor({ value, onChange, states = [], disabled, savedJobs = [], canRun = false }: CronJobsEditorProps) {
    const stateById = new Map(states.map((state) => [state.jobId, state]))
    const runJob = useRunCronJob()
    const [confirmJob, setConfirmJob] = useState<CronJobConfig | null>(null)
    const [runningJobId, setRunningJobId] = useState<string | null>(null)

    const executeNow = async (job: CronJobConfig) => {
        setConfirmJob(null)
        setRunningJobId(job.id)
        try {
            const result = await runJob.mutateAsync(job.id)
            if (result.ok) toast.success(`"${job.label}" executada (${result.message}, ${result.durationMs} ms)`)
            else toast.error(`"${job.label}" falhou: ${result.message}`)
        } catch (error) {
            toast.error(integrationErrorMessage(error, `Não foi possível executar "${job.label}"`))
        } finally {
            setRunningJobId(null)
        }
    }
    const update = (index: number, patch: Partial<CronJobConfig>) =>
        onChange(value.map((job, i) => (i === index ? { ...job, ...patch } : job)))

    const addJob = () => {
        let id = "nova-rotina"
        for (let n = 2; value.some((job) => job.id === id); n++) id = `nova-rotina-${n}`
        onChange([
            ...value,
            { id, label: "Nova rotina", kind: "http", path: "/api/routines/run", schedule: { type: "daily", time: "00:00" }, enabled: false },
        ])
    }

    return (
        <div className="space-y-3">
            <AnimatePresence initial={false}>
                {value.map((job, index) => (
                    <motion.div
                        key={index}
                        layout
                        initial={{ opacity: 0, y: -8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, height: 0, marginTop: 0, scale: 0.98 }}
                        transition={{ duration: 0.22 }}
                        className={cn("space-y-4 rounded-lg border p-4 transition-opacity", !job.enabled && "opacity-70")}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                                {job.kind === "http" ? (
                                    <Globe className="h-4 w-4 shrink-0 text-sky-600" />
                                ) : (
                                    <Cog className="h-4 w-4 shrink-0 text-violet-600" />
                                )}
                                {job.kind === "http" ? (
                                    <Input
                                        aria-label="Nome da rotina"
                                        value={job.label}
                                        onChange={(event) => {
                                            const label = event.target.value
                                            const isNew = !stateById.has(job.id) && job.id.startsWith("nova-rotina")
                                            update(index, isNew ? { label, id: slugify(label) || job.id } : { label })
                                        }}
                                        disabled={disabled}
                                        className="h-8 font-medium"
                                    />
                                ) : (
                                    <span className="truncate font-medium">{job.label}</span>
                                )}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <RunNowButton
                                    label={job.label}
                                    pending={runningJobId === job.id}
                                    blockReason={runNowBlockReason(job, savedJobs, canRun, Boolean(stateById.get(job.id)?.running))}
                                    onClick={() => setConfirmJob(job)}
                                />
                                <Switch
                                    checked={job.enabled}
                                    onCheckedChange={(enabled) => update(index, { enabled })}
                                    disabled={disabled}
                                    aria-label={`Ativar ${job.label}`}
                                />
                                {job.kind === "http" && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive hover:text-destructive"
                                        onClick={() => onChange(value.filter((_, i) => i !== index))}
                                        disabled={disabled}
                                        aria-label={`Remover ${job.label}`}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        </div>

                        {job.kind === "http" && (
                            <div className="space-y-1.5">
                                <Label htmlFor={`cron-path-${index}`} className="text-xs">
                                    Caminho
                                </Label>
                                <Input
                                    id={`cron-path-${index}`}
                                    value={job.path ?? ""}
                                    onChange={(event) => update(index, { path: event.target.value })}
                                    placeholder="/api/routines/..."
                                    className="font-mono text-xs"
                                    disabled={disabled}
                                />
                            </div>
                        )}

                        <ScheduleEditor value={job.schedule} onChange={(schedule) => update(index, { schedule })} disabled={disabled} />
                        {jobSupportsScope(job.id) && (
                            <div className="space-y-1.5">
                                <Label className="text-xs">Escopo</Label>
                                <OptionTabs<CronJobScope>
                                    aria-label={`Escopo de ${job.label}`}
                                    options={CRON_JOB_SCOPE_OPTIONS}
                                    value={job.scope ?? "pending"}
                                    onChange={(scope) => update(index, { scope })}
                                    disabled={disabled}
                                />
                                <p className="text-xs text-muted-foreground">
                                    “Só pendentes” marca apenas as tarefas sem tags ou com título/descrição alterados; “Todas” regenera as tags de todo o escopo.
                                </p>
                            </div>
                        )}
                        <JobStatus state={stateById.get(job.id)} enabled={job.enabled} manualRunning={runningJobId === job.id} />
                    </motion.div>
                ))}
            </AnimatePresence>
            <Button type="button" variant="outline" size="sm" onClick={addJob} disabled={disabled}>
                <Plus className="mr-1.5 h-4 w-4" /> Adicionar rotina
            </Button>

            <AlertDialog open={confirmJob !== null} onOpenChange={(open) => !open && setConfirmJob(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Executar “{confirmJob?.label}” agora?</AlertDialogTitle>
                        <AlertDialogDescription>
                            A rotina salva será executada imediatamente, com os mesmos efeitos da execução agendada. A próxima
                            execução agendada não muda.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => confirmJob && void executeNow(confirmJob)}>Executar agora</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
