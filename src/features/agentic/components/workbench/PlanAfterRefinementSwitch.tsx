"use client"

import { Switch } from "@/components/ui/switch"
import { useSetWorkbenchPlanAfterRefinement } from "../../hooks/useAgentic"
import type { WorkbenchDto } from "../../types"

/**
 * Switch "Gerar plano após refinar" da barra da mesa em "Refinando" (OPE-137): ligado, a mesa passa sozinha
 * ao planejamento quando a especificação fica pronta (vale o valor daquele momento); desligado, para em
 * "Especificação pronta". Mesmo desenho da chave "Gerar prévia".
 */
export function PlanAfterRefinementSwitch({ workbench }: { workbench: WorkbenchDto }) {
    const mutation = useSetWorkbenchPlanAfterRefinement(workbench)
    if (workbench.stage !== "refining") return null
    const id = `workbench-plan-after-refinement-${workbench.id}`
    const enabled = workbench.planAfterRefinement
    const hint = enabled ? "Ligado: com a especificação pronta, a mesa segue sozinha para o planejamento" : "Desligado: com a especificação pronta, a mesa para em Especificação pronta e espera você"
    return (
        <div className="flex shrink-0 items-center gap-2">
            <label htmlFor={id} className="cursor-pointer whitespace-nowrap text-xs text-muted-foreground" title={hint}>
                Gerar plano após refinar
            </label>
            <Switch id={id} checked={enabled} disabled={mutation.isPending} onCheckedChange={(checked) => mutation.mutate(checked)} aria-describedby={`${id}-hint`} className="h-5 w-9 after:h-4 after:w-4" />
            <span id={`${id}-hint`} className="sr-only">
                {hint}
            </span>
        </div>
    )
}
