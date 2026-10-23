"use client"

import { Switch } from "@/components/ui/switch"
import { useSetWorkbenchPreview } from "../../hooks/useAgentic"
import type { WorkbenchDto } from "../../types"

/**
 * Chave "Gerar prévia" da barra da mesa: desligada, a mesa pula a prévia e publica direto no PR
 * (fluxo PR automático só nesta mesa). Oculta em Finalizando e Concluída; disponível com o agente
 * trabalhando (vale no próximo fim de implementação ou de build).
 */
export function PreviewSwitch({ workbench }: { workbench: WorkbenchDto }) {
    const mutation = useSetWorkbenchPreview(workbench)
    if (workbench.stage === "finishing" || workbench.stage === "done") return null
    const id = `workbench-preview-${workbench.id}`
    const enabled = workbench.agenticFlow !== "auto_pr"
    const hint = enabled
        ? "Ligada: depois da implementação a mesa sobe a prévia e espera a sua aprovação antes de publicar no PR"
        : "Desligada: ao fim da implementação a mesa publica direto no PR, sem prévia. Religar com o PR aberto gera a prévia na hora"
    return (
        <div className="flex shrink-0 items-center gap-2" title={hint}>
            <Switch id={id} checked={enabled} disabled={mutation.isPending} onCheckedChange={(checked) => mutation.mutate(checked)} aria-describedby={`${id}-hint`} className="h-5 w-9 after:h-4 after:w-4" />
            <label htmlFor={id} className="cursor-pointer whitespace-nowrap text-xs text-muted-foreground">
                Gerar prévia
            </label>
            <span id={`${id}-hint`} className="sr-only">
                {hint}
            </span>
        </div>
    )
}
