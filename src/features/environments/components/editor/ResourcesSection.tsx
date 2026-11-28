"use client"

import { useWatch, type UseFormReturn } from "react-hook-form"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronRight } from "lucide-react"
import { FormSection } from "@/components/form-page/FormSection"
import { FORM_GRID_3 } from "@/components/ui/form-grid"
import { OptionTabs } from "@/components/ui/option-tabs"
import { useUrlFilters } from "@/hooks/useUrlFilters"
import { sectionAnchor } from "../../editor-sections"
import { useComposeRead } from "../../hooks/useFormComposeRead"
import { runningServiceNames, switchLimitMode } from "../../limits-form"
import { appliedLimitsText, limitsForService, limitsText } from "../../resource-limits"
import { DEFAULT_ENVIRONMENT_LIMITS, type EnvironmentInput, type EnvironmentLimits, type LimitMode } from "../../schemas"
import type { EnvironmentDto, HostCapacityDto } from "../../types"
import { ResourceLimitsFields } from "../ResourceLimitsFields"
import { SERVICE_PARAM_DEFAULTS, SERVICE_PARAM_SCHEMA } from "./service-param"

const MODE_OPTIONS = [
    { value: "shared", label: "Mesmos para todos" },
    { value: "service", label: "Por serviço" },
] as const

type LimitErrors = Partial<Record<"memoryGb" | "swapGb" | "cpus", { message?: string }>>

/**
 * Recursos: o modo dos limites. "Mesmos para todos" edita RAM, swap e CPUs aqui; "Por serviço" lista o
 * resumo de cada serviço, e cada linha leva ao grupo Recursos do painel do serviço.
 */
export function ResourcesSection({ form, env, host, machine }: { form: UseFormReturn<EnvironmentInput>; env: EnvironmentDto | null; host: HostCapacityDto | null; machine: string }) {
    const limits = (useWatch({ control: form.control, name: "limits" }) ?? DEFAULT_ENVIRONMENT_LIMITS) as EnvironmentLimits
    const read = useComposeRead()
    const [, setParams] = useUrlFilters(SERVICE_PARAM_DEFAULTS, SERVICE_PARAM_SCHEMA)
    const known = read.names ?? (env ? runningServiceNames(env) : [])
    const applied = env ? appliedLimitsText(env.services) : null
    const errors = form.formState.errors.limits as (LimitErrors & { services?: unknown[] }) | undefined
    const setLimits = (next: EnvironmentLimits) => form.setValue("limits", next, { shouldValidate: true, shouldDirty: true })
    const rows = limits.mode === "service" ? [...new Set([...known, ...limits.services.map((row) => row.service)])] : []
    const openService = (service: string) => {
        setParams({ servico: service })
        requestAnimationFrame(() => document.getElementById(`servico-recursos`)?.scrollIntoView?.({ behavior: "smooth", block: "center" }))
    }
    return (
        <FormSection id={sectionAnchor("recursos")} title="Recursos" description={`Limites de RAM, swap e CPU, aplicados no próximo deploy (Reiniciar e Levantar não aplicam). Vazio = sem limite.${applied ? ` No host hoje: ${applied}.` : ""}`}>
            <OptionTabs<LimitMode> id="environment-limits-mode" aria-label="Modo dos limites" options={MODE_OPTIONS} value={limits.mode} onChange={(mode) => setLimits(switchLimitMode(limits, mode, known))} className="w-full" />
            <AnimatePresence mode="wait" initial={false}>
                {limits.mode === "shared" ? (
                    <motion.div key="shared" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                        <ResourceLimitsFields control={form.control} prefix="limits." idPrefix="environment-limits" errors={errors} host={host} machine={machine} grid={FORM_GRID_3} />
                    </motion.div>
                ) : (
                    <motion.ul key="service" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="divide-y rounded-lg border" aria-label="Limites por serviço">
                        {rows.map((service) => {
                            const value = limitsForService(limits, service)
                            const index = limits.services.findIndex((row) => row.service === service)
                            const invalid = index >= 0 && Boolean(errors?.services?.[index])
                            return (
                                <li key={service}>
                                    <button
                                        type="button"
                                        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        onClick={() => openService(service)}
                                        aria-label={`Ajustar os limites de ${service}`}
                                    >
                                        <span className="font-mono">{service}</span>
                                        <span className={invalid ? "flex items-center gap-1 text-xs text-destructive" : "flex items-center gap-1 text-xs text-muted-foreground"}>
                                            {invalid ? "Corrija os limites" : value ? limitsText(value) : "Sem limite"}
                                            <ChevronRight className="h-4 w-4" aria-hidden />
                                        </span>
                                    </button>
                                </li>
                            )
                        })}
                        {!rows.length && <li className="px-4 py-3 text-xs text-muted-foreground">Os serviços aparecem quando o compose for lido (escolha a origem).</li>}
                    </motion.ul>
                )}
            </AnimatePresence>
        </FormSection>
    )
}
