"use client"

import { Container } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button"
import { useSetWorkbenchPreview } from "../../hooks/useAgentic"
import type { WorkbenchStage } from "../../constants"
import type { WorkbenchDto } from "../../types"
import { ActionSheetItem, ActionSheetSwitch } from "./mobile/ActionSheet"
import { PluginPreviewToggle } from "@/features/plugins/components/PluginPreviewToggle"

/** A chave (e o divisor antes dela) some em Finalizando e Concluída. */
export const previewSwitchVisible = (stage: WorkbenchStage, workbench?: Pick<WorkbenchDto, "kind" | "plugin" | "previewUrl">) => {
    if (stage === "finishing" || stage === "done") return false
    // Mesa Plugin (OPE-172): no lugar da chave "Gerar prévia", o "Ligar prévia" do plugin (quando já há prévia).
    if (workbench?.kind === "plugin") return Boolean(workbench.plugin?.pluginId && workbench.previewUrl)
    return true
}

/** Motivo do bloqueio de "Gerar nova prévia" (ou `null` quando disponível). */
export function rebuildBlockedReason({ saving, enabled, rebuildAvailable, actionPending }: { saving: boolean; enabled: boolean; rebuildAvailable: boolean; actionPending: boolean }): string | null {
    if (saving) return "Salvando a chave Gerar prévia…"
    if (!enabled) return "Ligue “Gerar prévia” para gerar uma nova prévia"
    if (!rebuildAvailable) return "Disponível quando a prévia estiver pronta"
    if (actionPending) return "Aguarde a ação em andamento"
    return null
}

interface PreviewSwitchProps {
    workbench: WorkbenchDto
    /** A etapa oferece "Gerar nova prévia" (Prévia pronta). */
    rebuildAvailable: boolean
    /** Outra ação da mesa em andamento. */
    actionPending: boolean
    onRebuild: () => void
    /**
     * `bar` (padrão): rótulo, chave e o botão de ícone na barra do desktop. `sheet`: folha "Mais ações" do
     * celular (OPE-166), com a explicação e o motivo do bloqueio em texto (no toque não há dica).
     */
    layout?: "bar" | "sheet"
}

/**
 * Chave "Gerar prévia" da barra da mesa: desligada, a mesa pula a prévia e publica direto no PR
 * (fluxo PR automático só nesta mesa). Oculta em Finalizando e Concluída; disponível com o agente
 * trabalhando (vale no próximo fim de implementação ou de build). O rótulo fica à esquerda da chave e,
 * à direita, o botão de ícone **Gerar nova prévia**: sempre visível, bloqueado (com o motivo na dica)
 * com a chave desligada ou salvando, fora da Prévia pronta ou com outra ação em andamento.
 */
export function PreviewSwitch({ workbench, rebuildAvailable, actionPending, onRebuild, layout = "bar" }: PreviewSwitchProps) {
    const mutation = useSetWorkbenchPreview(workbench)
    if (!previewSwitchVisible(workbench.stage, workbench)) return null
    if (workbench.kind === "plugin" && workbench.plugin?.pluginId) return <PluginPreviewToggle pluginId={workbench.plugin.pluginId} previewUrl={workbench.previewUrl} layout={layout} />
    const id = `workbench-preview-${workbench.id}`
    const enabled = workbench.agenticFlow !== "auto_pr"
    const hint = enabled
        ? "Ligada: depois da implementação a mesa sobe a prévia e espera a sua aprovação antes de publicar no PR"
        : "Desligada: ao fim da implementação a mesa publica direto no PR, sem prévia. Religar com o PR aberto gera a prévia na hora"
    const blockedReason = rebuildBlockedReason({ saving: mutation.isPending, enabled, rebuildAvailable, actionPending })
    if (layout === "sheet")
        return (
            <div className="space-y-1.5">
                <ActionSheetSwitch id={id} label="Gerar prévia" hint={hint} checked={enabled} disabled={mutation.isPending} onCheckedChange={(checked) => mutation.mutate(checked)} />
                <ActionSheetItem icon={Container} label="Gerar nova prévia" hint="Reconstrói a prévia com o código atual" disabledReason={blockedReason} onSelect={onRebuild} />
            </div>
        )
    return (
        <div className="flex shrink-0 items-center gap-2">
            <label htmlFor={id} className="cursor-pointer whitespace-nowrap text-xs text-muted-foreground" title={hint}>
                Gerar prévia
            </label>
            <Switch id={id} checked={enabled} disabled={mutation.isPending} onCheckedChange={(checked) => mutation.mutate(checked)} aria-describedby={`${id}-hint`} className="h-5 w-9 after:h-4 after:w-4" />
            <span id={`${id}-hint`} className="sr-only">
                {hint}
            </span>
            <TooltipIconButton
                label="Gerar nova prévia"
                tooltip="Reconstrói a prévia com o código atual"
                disabledReason={blockedReason}
                onClick={onRebuild}
                className="h-8 min-w-8 px-2"
            >
                <Container aria-hidden />
            </TooltipIconButton>
        </div>
    )
}
