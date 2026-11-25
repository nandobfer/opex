"use client"

import { useState } from "react"
import { useWatch, type UseFormReturn } from "react-hook-form"
import { AnimatePresence, motion } from "framer-motion"
import { AlertCircle, FileSearch, RotateCw, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FORM_GRID_3 } from "@/components/ui/form-grid"
import { Label } from "@/components/ui/label"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { useReadComposeServices } from "../hooks/useEnvironments"
import { mergeComposeServices, orphanServices, runningServiceNames, switchLimitMode } from "../limits-form"
import { appliedLimitsText } from "../resource-limits"
import type { EnvironmentInput, EnvironmentLimits, LimitMode } from "../schemas"
import type { EnvironmentDto, HostCapacityDto } from "../types"
import { ResourceLimitsFields } from "./ResourceLimitsFields"

const MODE_OPTIONS = [
    { value: "shared", label: "Mesmos para cada serviço" },
    { value: "service", label: "Por serviço" },
] as const

type LimitFieldErrors = { message?: string }
type LimitErrors = Partial<Record<"memoryGb" | "swapGb" | "cpus", LimitFieldErrors>> & { services?: (Partial<Record<"memoryGb" | "swapGb" | "cpus", LimitFieldErrors>> | undefined)[] & LimitFieldErrors }

/** Linhas de carregamento com as dimensões de uma linha de serviço. */
function LimitRowsSkeleton() {
    return (
        <div className="space-y-3" aria-label="Lendo o compose">
            {[0, 1].map((row) => (
                <div key={row} className="space-y-2 rounded-md border border-border p-3">
                    <Skeleton className="h-4 w-24" />
                    <div className={FORM_GRID_3}>
                        <Skeleton className="h-9" />
                        <Skeleton className="h-9" />
                        <Skeleton className="h-9" />
                    </div>
                </div>
            ))}
        </div>
    )
}

/**
 * Limites de recursos do ambiente (OPE-193): os mesmos para cada serviço ou por serviço, com "Ler
 * compose" (serviços e limites declarados). Valem no próximo deploy; mostra o que está aplicado no host.
 */
export function EnvironmentLimitsField({ form, env, host, machine }: { form: UseFormReturn<EnvironmentInput>; env: EnvironmentDto | null; host: HostCapacityDto | null; machine: string }) {
    const limits = useWatch({ control: form.control, name: "limits" }) as EnvironmentLimits
    const read = useReadComposeServices()
    const [composeNames, setComposeNames] = useState<string[] | null>(null)
    const known = composeNames ?? (env ? runningServiceNames(env) : null)
    const errors = form.formState.errors.limits as LimitErrors | undefined
    const applied = env ? appliedLimitsText(env.services) : null
    const setLimits = (next: EnvironmentLimits) => form.setValue("limits", next, { shouldValidate: true, shouldDirty: true })

    const readCompose = () =>
        read.mutate(
            { source: form.getValues("source") },
            {
                onSuccess: (result) => {
                    setComposeNames(result.services.map((service) => service.name))
                    const merged = mergeComposeServices(form.getValues("limits"), result)
                    setLimits(merged.limits)
                    if (merged.differs) toast.info("O compose declara limites diferentes por serviço: use \"Por serviço\" para vê-los.")
                    else toast.success(`Compose lido: ${result.services.length} serviço(s)${merged.filled ? "; limites declarados preenchidos" : ""}`)
                },
            },
        )

    const changeMode = (mode: LimitMode) => {
        const next = switchLimitMode(form.getValues("limits"), mode, known ?? [])
        setLimits(next)
        if (next.mode === "service" && !next.services.length) readCompose()
    }

    const removeRow = (service: string) => {
        if (limits.mode === "service") setLimits({ mode: "service", services: limits.services.filter((row) => row.service !== service) })
    }

    const orphans = orphanServices(limits, composeNames)
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Limites de recursos</Label>
                <Button type="button" variant="ghost" size="sm" className="gap-1" disabled={read.isPending} onClick={readCompose}>
                    <FileSearch className="h-4 w-4" aria-hidden /> {read.isPending ? "Lendo…" : "Ler compose"}
                </Button>
            </div>
            <OptionTabs<LimitMode> id="environment-limits-mode" aria-label="Modo dos limites" options={MODE_OPTIONS} value={limits.mode} onChange={changeMode} className="w-full" />
            <p className="text-xs text-muted-foreground">
                Valem no próximo deploy (Reiniciar e Levantar não aplicam). Vazio = sem limite: o que o próprio compose declara continua valendo.
                {applied ? ` No host hoje: ${applied}.` : ""}
            </p>
            {read.isError && !read.isPending && (
                <div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 px-3 py-2 text-xs text-destructive">
                    <span className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden /> Não foi possível ler o compose da origem.
                    </span>
                    <Button type="button" variant="outline" size="sm" className="gap-1" onClick={readCompose}>
                        <RotateCw className="h-4 w-4" aria-hidden /> Tentar novamente
                    </Button>
                </div>
            )}
            {limits.mode === "shared" ? (
                <ResourceLimitsFields control={form.control} prefix="limits." idPrefix="environment-limits" errors={errors} host={host} machine={machine} grid={FORM_GRID_3} />
            ) : read.isPending && !limits.services.length ? (
                <LimitRowsSkeleton />
            ) : (
                <div className="space-y-3">
                    <AnimatePresence initial={false}>
                        {limits.services.map((row, index) => (
                            <motion.div key={row.service} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="space-y-2 rounded-md border border-border p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="flex items-center gap-2 font-mono text-sm">
                                        {row.service}
                                        {orphans.includes(row.service) && <Badge variant="outline">não está no compose</Badge>}
                                    </span>
                                    <Button type="button" variant="ghost" size="icon" aria-label={`Remover os limites de ${row.service}`} onClick={() => removeRow(row.service)}>
                                        <Trash2 className="h-4 w-4" aria-hidden />
                                    </Button>
                                </div>
                                <ResourceLimitsFields control={form.control} prefix={`limits.services.${index}.`} idPrefix={`environment-limits-${row.service}`} errors={errors?.services?.[index]} host={host} machine={machine} grid={FORM_GRID_3} />
                            </motion.div>
                        ))}
                    </AnimatePresence>
                    {!limits.services.length && (
                        <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-2">
                                <FileSearch className="h-4 w-4 shrink-0" aria-hidden /> Nenhum serviço: leia o compose para listar os serviços.
                            </span>
                            <Button type="button" variant="outline" size="sm" onClick={readCompose} disabled={read.isPending}>
                                Ler compose
                            </Button>
                        </div>
                    )}
                    {errors?.services?.message && <p className="text-xs text-destructive">{errors.services.message}</p>}
                </div>
            )}
        </div>
    )
}
