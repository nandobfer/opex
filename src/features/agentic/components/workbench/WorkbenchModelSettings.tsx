"use client"

import { useAiModels } from "@/features/ai/hooks/useAi"
import { STAGE_MODEL_ROLE, WORKBENCH_MODEL_ROLE_LABELS } from "../../constants"
import { useSetWorkbenchModel } from "../../hooks/useAgentic"
import type { WorkbenchDto } from "../../types"
import { ModelInUse } from "./ModelInUse"
import { ModelSettingsPopover } from "./ModelSettingsPopover"
import { MODEL_SOURCE_LABELS } from "./model-settings"
import { WorkbenchModelSections, pendingRoleOf, pendingText } from "./WorkbenchModelSections"

/** Etapas sem turno a configurar: texto e botão ocultos. */
const HIDDEN_STAGES: readonly WorkbenchDto["stage"][] = ["finishing", "done"]

/**
 * Modelo da mesa na barra inferior: o texto do modelo e da variante em uso na etapa atual (na
 * revisão adversária, o do Agente Adversário, só leitura) e um botão de configuração que abre o
 * popover com o modelo de cada etapa (mesa > central > padrão global). Oculto em Concluindo e
 * Concluída e quando a central não pôde ser lida.
 */
export function WorkbenchModelSettings({ workbench, buttonClassName }: { workbench: WorkbenchDto; buttonClassName?: string }) {
    const models = useAiModels("opencode")
    const mutation = useSetWorkbenchModel(workbench)
    if (!workbench.models || HIDDEN_STAGES.includes(workbench.stage)) return null
    const role = STAGE_MODEL_ROLE[workbench.stage]
    const choice = role ? workbench.models[role] : null
    const adversarial = workbench.stage === "adversarial_review" ? workbench.adversarialModel : null
    return (
        <div className="flex min-w-0 items-center gap-2" data-testid="workbench-model-settings">
            {choice && role ? (
                <ModelInUse label={WORKBENCH_MODEL_ROLE_LABELS[role]} choice={choice} sourceText={choice.source ? MODEL_SOURCE_LABELS[choice.source] : undefined} highlighted={choice.overridden} models={models.data} />
            ) : adversarial ? (
                <ModelInUse label="Modelo do Agente Adversário" choice={adversarial} sourceText="configurado na aba Agente Adversário" models={models.data} />
            ) : null}
            <ModelSettingsPopover id={`workbench-models-${workbench.id}`} label="Configurar modelos por etapa" liveText={pendingText(pendingRoleOf(mutation))} className={buttonClassName}>
                <WorkbenchModelSections workbench={workbench} models={models} mutation={mutation} idPrefix={`workbench-models-${workbench.id}`} />
            </ModelSettingsPopover>
        </div>
    )
}
