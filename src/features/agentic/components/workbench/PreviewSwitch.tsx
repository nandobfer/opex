"use client"

import { Container } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button"
import { useSetWorkbenchPreview } from "../../hooks/useAgentic"
import type { WorkbenchStage } from "../../constants"
import type { WorkbenchDto } from "../../types"

/** A chave (e o divisor antes dela) some em Finalizando e Concluída. */
export const previewSwitchVisible = (stage: WorkbenchStage) => stage !== "finishing" && stage !== "done"

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
}

/**
 * Chave "Gerar prévia" da barra da mesa: desligada, a mesa pula a prévia e publica direto no PR
 * (fluxo PR automático só nesta mesa). Oculta em Finalizando e Concluída; disponível com o agente
 * trabalhando (vale no próximo fim de implementação ou de build). O rótulo fica à esquerda da chave e,
 * à direita, o botão de ícone **Gerar nova prévia**: sempre visível, bloqueado (com o motivo na dica)
 * com a chave desligada ou salvando, fora da Prévia pronta ou com outra ação em andamento.
 */
export function PreviewSwitch({ workbench, rebuildAvailable, actionPending, onRebuild }: PreviewSwitchProps) {
    const mutation = useSetWorkbenchPreview(workbench)
    if (!previewSwitchVisible(workbench.stage)) return null
    const id = `workbench-preview-${workbench.id}`
    const enabled = workbench.agenticFlow !== "auto_pr"
    const hint = enabled
        ? "Ligada: depois da implementação a mesa sobe a prévia e espera a sua aprovação antes de publicar no PR"
        : "Desligada: ao fim da implementação a mesa publica direto no PR, sem prévia. Religar com o PR aberto gera a prévia na hora"
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
                disabledReason={rebuildBlockedReason({ saving: mutation.isPending, enabled, rebuildAvailable, actionPending })}
                onClick={onRebuild}
                className="h-8 min-w-8 px-2"
            >
                <Container aria-hidden />
            </TooltipIconButton>
        </div>
    )
}
