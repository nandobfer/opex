"use client"

import { useWatch, type UseFormReturn } from "react-hook-form"
import { Plus, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FORM_GRID_3 } from "@/components/ui/form-grid"
import { scrollToSection } from "@/components/form-page/FormSectionNav"
import { sectionAnchor } from "../../editor-sections"
import { hasAnyLimit, limitsForService, limitsText } from "../../resource-limits"
import { DEFAULT_ENVIRONMENT_LIMITS, type EnvironmentInput, type EnvironmentLimits } from "../../schemas"
import type { ComposeServicesDto, EnvironmentDto, HostCapacityDto } from "../../types"
import { ResourceLimitsFields } from "../ResourceLimitsFields"

type LimitErrors = { services?: (Partial<Record<"memoryGb" | "swapGb" | "cpus", { message?: string }>> | undefined)[] }

/**
 * Grupo Recursos do painel do serviço: no modo "Por serviço", os limites do serviço (com o declarado no
 * compose e o aplicado no host); no modo único, o aviso de que os limites são os mesmos para todos.
 */
export function ServiceLimitsGroup({ form, service, env, read, host, machine }: { form: UseFormReturn<EnvironmentInput>; service: string; env: EnvironmentDto | null; read: ComposeServicesDto | null; host: HostCapacityDto | null; machine: string }) {
    const limits = (useWatch({ control: form.control, name: "limits" }) ?? DEFAULT_ENVIRONMENT_LIMITS) as EnvironmentLimits
    const setLimits = (next: EnvironmentLimits) => form.setValue("limits", next, { shouldValidate: true, shouldDirty: true })
    if (limits.mode === "shared") {
        const shared = limitsForService(limits, service)
        return (
            <p className="py-3 text-sm text-muted-foreground">
                Limites iguais para todos os serviços ({shared ? limitsText(shared) : "sem limite"}).{" "}
                <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => scrollToSection(sectionAnchor("recursos"), { smooth: true })}>
                    Ajustar em Recursos
                </button>
            </p>
        )
    }
    const index = limits.services.findIndex((row) => row.service === service)
    const declared = read?.services.find((item) => item.name === service)?.declared
    const applied = env?.services.find((item) => item.service === service)?.limits
    const errors = (form.formState.errors.limits as LimitErrors | undefined)?.services?.[index]
    return (
        <div className="space-y-3 py-3">
            <p className="text-xs text-muted-foreground">
                {declared && hasAnyLimit(declared) ? `No compose: ${limitsText(declared)}. ` : "O compose não declara limites. "}
                {applied && hasAnyLimit(applied) ? `No host hoje: ${limitsText(applied)}.` : ""}
            </p>
            {index < 0 ? (
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setLimits({ mode: "service", services: [...limits.services, { service, memoryGb: null, swapGb: null, cpus: null }] })}>
                    <Plus className="h-4 w-4" aria-hidden /> Definir limites de {service}
                </Button>
            ) : (
                <>
                    <ResourceLimitsFields control={form.control} prefix={`limits.services.${index}.`} idPrefix={`environment-limits-${service}`} errors={errors} host={host} machine={machine} grid={FORM_GRID_3} />
                    <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => setLimits({ mode: "service", services: limits.services.filter((row) => row.service !== service) })}>
                        <Undo2 className="h-4 w-4" aria-hidden /> Sem limite para {service}
                    </Button>
                </>
            )}
        </div>
    )
}
