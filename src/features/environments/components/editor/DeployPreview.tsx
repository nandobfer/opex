"use client"

import { useWatch, type UseFormReturn } from "react-hook-form"
import { Badge } from "@/components/ui/badge"
import { deployPreview } from "../../editor-sections"
import { useComposeRead } from "../../hooks/useFormComposeRead"
import { DEFAULT_ENVIRONMENT_LIMITS, type EnvironmentInput, type EnvironmentLimits } from "../../schemas"
import { composeOverridesText, sameComposeOverrides } from "../../service-overrides"
import type { EnvironmentDto } from "../../types"

/**
 * "O que muda no deploy": o `docker-compose.opex.yml` que o próximo deploy vai gerar com o que está na tela
 * (valores do environment ocultos) e, no Editar, se difere do que está implantado.
 */
export function DeployPreview({ form, env }: { form: UseFormReturn<EnvironmentInput>; env: EnvironmentDto | null }) {
    const read = useComposeRead()
    const values = useWatch({ control: form.control })
    const overrides = values.composeOverrides ?? null
    if (!read.result) return <p className="text-sm text-muted-foreground">A prévia aparece quando o compose for lido.</p>
    const yaml = deployPreview({
        read: read.result,
        slug: values.slug ?? "",
        buildOn: values.buildOn ?? "server",
        runOn: values.runOn ?? "server",
        hasVars: (values.env ?? []).some((item) => item?.key),
        limits: (values.limits ?? DEFAULT_ENVIRONMENT_LIMITS) as EnvironmentLimits,
        overrides: overrides as EnvironmentInput["composeOverrides"],
        selected: values.source && "services" in values.source ? (values.source.services ?? []).filter((name): name is string => Boolean(name)) : [],
    })
    const deployed = env?.deployedOn ? env.deployedComposeOverrides : undefined
    const differs = deployed !== undefined && !sameComposeOverrides(overrides as EnvironmentInput["composeOverrides"], deployed)
    return (
        <div className="space-y-3">
            {deployed !== undefined && (
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className={differs ? "border-warning/50 text-warning" : "text-success"}>
                        {differs ? "Difere do implantado" : "Igual ao implantado"}
                    </Badge>
                    Implantado: {composeOverridesText(deployed) || "sem ajustes"}.
                </p>
            )}
            <pre aria-label="Override do próximo deploy" className="max-h-96 overflow-auto rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
                {yaml}
            </pre>
            <p className="text-xs text-muted-foreground">Gerado como no deploy; os marcadores &lt;porta&gt; e &lt;commit&gt; só existem na hora do deploy.</p>
        </div>
    )
}
