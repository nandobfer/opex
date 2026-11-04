"use client"

import type { ModelVariantValue } from "@/features/ai/components/model-picker/ModelVariantFields"
import { useAiModels } from "@/features/ai/hooks/useAi"
import { WORKBENCH_MODEL_ROLE_LABELS, type WorkbenchModelRole } from "../../constants"
import { draftWorkbenchModels, type ModelOverride, type RefinerAgent } from "../../logic"
import type { AgenticSettings } from "../../schemas"
import type { CentralDto } from "../../types"
import { ModelSettingsControl } from "./ModelSettingsControl"
import { MODEL_SOURCE_LABELS } from "./model-settings"
import { WorkbenchModelSections } from "./WorkbenchModelSections"

/** Papel da etapa inicial: a mesa nasce no planejamento. */
const START_ROLE = "planning"

interface StartWorkbenchModelSettingsProps {
    central: CentralDto
    /** Configuração geral já carregada; ausente = controle oculto (sem modelos para mostrar). */
    settings?: AgenticSettings
    /** Trocas escolhidas na tela, por papel (enviadas ao abrir a mesa). */
    overrides: Partial<Record<WorkbenchModelRole, ModelOverride>>
    /** Modelo do Agente Refinador (base do papel "Refinamento" — OPE-137); `null` enquanto carrega. */
    refiner?: RefinerAgent | null
    onChange: (role: WorkbenchModelRole, input: ModelVariantValue) => void
}

/**
 * Modelos na etapa inicial da mesa (antes de ela existir — OPE-134): o mesmo texto em uso e o mesmo
 * popover da mesa em andamento, com "Etapa atual" no Planejamento. A escolha fica **só na tela** e
 * vai junto do clique em "Abrir mesa e gerar o plano" (`modelOverrides`); a mesa nasce com ela, então o
 * primeiro turno já usa o modelo escolhido. Não é gravada na tarefa: abrir pela fila da central ou
 * recarregar a página volta aos padrões da central/global.
 */
export function StartWorkbenchModelSettings({ central, settings, overrides, refiner = null, onChange }: StartWorkbenchModelSettingsProps) {
    const models = useAiModels("opencode")
    if (!settings) return null
    const choices = draftWorkbenchModels(settings, central.config, overrides, refiner)
    const choice = choices[START_ROLE]
    return (
        <ModelSettingsControl
            id="start-workbench-models"
            testId="start-workbench-model-settings"
            buttonLabel="Configurar modelos por etapa"
            models={models}
            inUse={{ label: WORKBENCH_MODEL_ROLE_LABELS[START_ROLE], choice, sourceText: choice.source ? MODEL_SOURCE_LABELS[choice.source] : undefined, highlighted: choice.overridden }}
        >
            <WorkbenchModelSections choices={choices} models={models} idPrefix="start-workbench-models" currentRole={START_ROLE} onChange={onChange} />
        </ModelSettingsControl>
    )
}
