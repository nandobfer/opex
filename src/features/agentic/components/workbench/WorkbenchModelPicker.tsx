"use client"

import { STAGE_MODEL_ROLE, WORKBENCH_MODEL_ROLE_LABELS } from "../../constants"
import { useSetWorkbenchModel } from "../../hooks/useAgentic"
import type { WorkbenchDto } from "../../types"
import { ModelOverridePicker } from "./ModelOverridePicker"

/**
 * Seletor "Modelo do <etapa>" da barra da mesa: troca o modelo do papel da etapa atual (só nesta mesa).
 * Oculto em Finalizando e Concluída (não há turno a configurar) e quando a central não pôde ser lida.
 */
export function WorkbenchModelPicker({ workbench }: { workbench: WorkbenchDto }) {
    const mutation = useSetWorkbenchModel(workbench)
    const role = STAGE_MODEL_ROLE[workbench.stage]
    if (!role || !workbench.models) return null
    return (
        <ModelOverridePicker
            id={`workbench-model-${workbench.id}`}
            label={WORKBENCH_MODEL_ROLE_LABELS[role]}
            choice={workbench.models[role]}
            disabled={mutation.isPending}
            onChange={(input) => mutation.mutate({ role, ...input })}
        />
    )
}
