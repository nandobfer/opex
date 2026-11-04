"use client"

import { useAiModels } from "@/features/ai/hooks/useAi"
import { useSetWorkbenchModel } from "../../hooks/useAgentic"
import { useSetForkModel } from "../../hooks/useForks"
import type { ForkDto, WorkbenchDto } from "../../types"
import { ModelRoleSection } from "./ModelRoleSection"
import { ModelSettingsControl } from "./ModelSettingsControl"
import { MODEL_SOURCE_LABELS } from "./model-settings"
import { WorkbenchModelSections, pendingRoleOf, pendingText } from "./WorkbenchModelSections"

/**
 * Modelo do fork na barra do fork: texto do modelo/variante em uso e o botão de configuração com o
 * mesmo popover da mesa, começando por "Este fork" (troca só deste fork) e seguido das etapas da
 * mesa (inclusive o Fork da mesa, base de todos os forks dela). Precedência: fork > mesa > central > global.
 */
export function ForkModelSettings({ workbench, fork, buttonClassName }: { workbench: WorkbenchDto; fork: ForkDto; buttonClassName?: string }) {
    const models = useAiModels("opencode")
    const setForkModel = useSetForkModel(workbench.id, fork)
    const setWorkbenchModel = useSetWorkbenchModel(workbench)
    if (!fork.model) return null
    const choice = fork.model
    const forkPending = setForkModel.isPending
    const liveText = forkPending ? "Alterando: Este fork" : pendingText(pendingRoleOf(setWorkbenchModel))
    return (
        <ModelSettingsControl
            id={`fork-models-${fork.id}`}
            testId="fork-model-settings"
            buttonLabel="Configurar modelos do fork e das etapas"
            models={models}
            inUse={{ label: "Modelo do fork", choice, sourceText: choice.source ? MODEL_SOURCE_LABELS[choice.source] : undefined, highlighted: choice.overridden }}
            liveText={liveText}
            className={buttonClassName}
        >
            <ModelRoleSection
                id={`fork-models-${fork.id}-self`}
                role="fork"
                title="Este fork"
                description={`Só o fork ${fork.number}. Vale a partir da próxima mensagem (inclusive a consolidação do resumo).`}
                choice={choice}
                current
                pending={forkPending}
                inheritLabel="Padrão da mesa"
                customLabel="Personalizar neste fork"
                models={models}
                onChange={(input) => setForkModel.mutate(input)}
            />
            <WorkbenchModelSections
                choices={workbench.models}
                models={models}
                idPrefix={`fork-models-${fork.id}-workbench`}
                pendingRole={pendingRoleOf(setWorkbenchModel)}
                onChange={(role, input) => setWorkbenchModel.mutate({ role, ...input })}
            />
        </ModelSettingsControl>
    )
}
