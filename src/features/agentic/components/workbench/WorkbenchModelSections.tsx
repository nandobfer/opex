"use client"

import { AGENT_ROLE_LABELS, STAGE_MODEL_ROLE, WORKBENCH_MODEL_ROLES, type WorkbenchModelRole } from "../../constants"
import { useSetWorkbenchModel } from "../../hooks/useAgentic"
import type { WorkbenchDto } from "../../types"
import type { AiModelDto } from "@/lib/ai/providers"
import { ModelRoleSection } from "./ModelRoleSection"

/** Descrição da etapa Fork no popover da mesa (as demais usam a descrição do papel, como na central). */
const FORK_ROLE_DESCRIPTION = "Forks desta mesa, exceto os que têm modelo próprio. Vale a partir da próxima mensagem."

type Models = { data?: AiModelDto[]; isError?: boolean; isLoading: boolean; error?: unknown }

/** Etapa em gravação na mesa (`null` sem gravação), para o destaque e o texto ao vivo. */
export function pendingRoleOf(mutation: { isPending: boolean; variables?: { role: WorkbenchModelRole } }): WorkbenchModelRole | null {
    return mutation.isPending ? (mutation.variables?.role ?? null) : null
}

export const pendingText = (role: WorkbenchModelRole | null) => (role ? `Alterando: ${AGENT_ROLE_LABELS[role].label}` : null)

/**
 * Seções das etapas da mesa no popover de modelos (Planejamento, Implementação, Build e ambiente,
 * Pull Request e Fork): cada troca grava na hora o papel daquela seção (`PUT .../model`).
 */
export function WorkbenchModelSections({ workbench, models, mutation, idPrefix, markCurrent = true }: { workbench: WorkbenchDto; models: Models; mutation: ReturnType<typeof useSetWorkbenchModel>; idPrefix: string; markCurrent?: boolean }) {
    if (!workbench.models) return null
    const currentRole = markCurrent ? STAGE_MODEL_ROLE[workbench.stage] : null
    const pending = pendingRoleOf(mutation)
    return (
        <>
            {WORKBENCH_MODEL_ROLES.filter((role) => workbench.models![role]).map((role) => (
                <ModelRoleSection
                    key={role}
                    id={`${idPrefix}-${role}`}
                    role={role}
                    description={role === "fork" ? FORK_ROLE_DESCRIPTION : undefined}
                    choice={workbench.models![role]}
                    current={role === currentRole}
                    pending={pending === role}
                    inheritLabel="Padrão da central"
                    customLabel="Personalizar nesta mesa"
                    models={models}
                    onChange={(input) => mutation.mutate({ role, ...input })}
                />
            ))}
        </>
    )
}
