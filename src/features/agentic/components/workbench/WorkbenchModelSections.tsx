"use client"

import type { ModelVariantValue } from "@/features/ai/components/model-picker/ModelVariantFields"
import type { AiModelDto } from "@/lib/ai/providers"
import { WORKBENCH_MODEL_ROLE_INFO, WORKBENCH_MODEL_ROLES, type WorkbenchModelRole } from "../../constants"
import type { ModelChoiceDto } from "../../types"
import { ModelRoleSection } from "./ModelRoleSection"

/** Descrição da etapa Fork no popover da mesa (as demais usam a descrição do papel, como na central). */
const FORK_ROLE_DESCRIPTION = "Forks desta mesa, exceto os que têm modelo próprio. Vale a partir da próxima mensagem."

type Models = { data?: AiModelDto[]; isError?: boolean; isLoading: boolean; error?: unknown }

/** Etapa em gravação na mesa (`null` sem gravação), para o destaque e o texto ao vivo. */
export function pendingRoleOf(mutation: { isPending: boolean; variables?: { role: WorkbenchModelRole } }): WorkbenchModelRole | null {
    return mutation.isPending ? (mutation.variables?.role ?? null) : null
}

export const pendingText = (role: WorkbenchModelRole | null) => (role ? `Alterando: ${WORKBENCH_MODEL_ROLE_INFO[role].label}` : null)

interface WorkbenchModelSectionsProps {
    /** Modelos efetivos por papel (`null` = central ilegível: nenhuma seção). */
    choices: Partial<Record<WorkbenchModelRole, ModelChoiceDto>> | null
    models: Models
    idPrefix: string
    /** Papel da etapa atual (badge "Etapa atual"); `null` no popover do fork. */
    currentRole?: WorkbenchModelRole | null
    /** Papel em gravação (destaque + "Alterando"). */
    pendingRole?: WorkbenchModelRole | null
    /** Entrega a troca de uma etapa a quem guarda os modelos (servidor na mesa, estado local na abertura). */
    onChange: (role: WorkbenchModelRole, input: ModelVariantValue) => void
}

/**
 * Seções das etapas da mesa no popover de modelos (Refinamento, Planejamento, Implementação, Build e
 * ambiente, Pull Request e Fork): cada troca é entregue ao dono dos dados com o papel daquela seção. Usado pela
 * mesa em andamento, pelo fork e pela etapa inicial (antes de a mesa existir — OPE-134).
 */
export function WorkbenchModelSections({ choices, models, idPrefix, currentRole = null, pendingRole = null, onChange }: WorkbenchModelSectionsProps) {
    if (!choices) return null
    return (
        <>
            {WORKBENCH_MODEL_ROLES.flatMap((role) => {
                const choice = choices[role]
                return choice ? [{ role, choice }] : []
            }).map(({ role, choice }) => (
                <ModelRoleSection
                    key={role}
                    id={`${idPrefix}-${role}`}
                    role={role}
                    description={role === "fork" ? FORK_ROLE_DESCRIPTION : undefined}
                    choice={choice}
                    current={role === currentRole}
                    pending={pendingRole === role}
                    inheritLabel={role === "refinement" ? "Padrão do Agente Refinador" : "Padrão da central"}
                    customLabel="Personalizar nesta mesa"
                    models={models}
                    onChange={(input) => onChange(role, input)}
                />
            ))}
        </>
    )
}
