import type { IAgenticFork, IAgenticWorkbench } from "@/lib/db/models/Agentic"
import { WORKBENCH_MODEL_ROLES, type AgentRole, type WorkbenchModelRole } from "../constants"
import { applyModelOverride, asModelOverride, resolveAgent, type ModelOverride } from "../logic"
import type { AgentConfig, AgenticSettings, CentralConfig, ModelOverrideInput } from "../schemas"
import type { ModelChoiceDto } from "../types"
import { loadCentral } from "./centrals"
import { assertAgentConfigs, loadAgenticSettings } from "./settings"

/**
 * Troca do modelo na mesa e no fork (SOMENTE servidor): resolve o modelo efetivo de cada papel
 * (configuração do papel + troca gravada) e valida a troca no OpenCode.
 */

/** Modelo efetivo de um papel para a tela: o do papel ou o trocado. */
export function toModelChoice(base: AgentConfig, override: ModelOverride | null): ModelChoiceDto {
    const effective = applyModelOverride(base, override)
    return { model: effective.model, variant: effective.model ? effective.variant : null, overridden: Boolean(override) }
}

/** Trocas da mesa, por papel, já validadas. */
export function workbenchOverrides(doc: Pick<IAgenticWorkbench, "modelOverrides">): Partial<Record<WorkbenchModelRole, ModelOverride>> {
    const raw = (doc.modelOverrides ?? {}) as Record<string, unknown>
    const result: Partial<Record<WorkbenchModelRole, ModelOverride>> = {}
    for (const role of WORKBENCH_MODEL_ROLES) {
        const override = asModelOverride(raw[role])
        if (override) result[role] = override
    }
    return result
}

/** Agente do turno de um papel da conversa principal, com a troca de modelo da mesa aplicada. */
export function workbenchTurnAgent(settings: AgenticSettings, config: Pick<CentralConfig, "agents">, doc: Pick<IAgenticWorkbench, "modelOverrides">, role: AgentRole): AgentConfig {
    const base = resolveAgent(settings, config, role)
    return role === "fork" ? base : applyModelOverride(base, workbenchOverrides(doc)[role] ?? null)
}

/** Modelos efetivos dos papéis da mesa (`null` se a central não puder ser lida). */
export async function workbenchModels(doc: Pick<IAgenticWorkbench, "centralId" | "modelOverrides">): Promise<Record<WorkbenchModelRole, ModelChoiceDto> | null> {
    try {
        const [{ settings }, { config }] = await Promise.all([loadAgenticSettings(), loadCentral(doc.centralId)])
        const overrides = workbenchOverrides(doc)
        return Object.fromEntries(WORKBENCH_MODEL_ROLES.map((role) => [role, toModelChoice(resolveAgent(settings, config, role), overrides[role] ?? null)])) as Record<WorkbenchModelRole, ModelChoiceDto>
    } catch {
        return null
    }
}

/** Modelo efetivo de um fork (`null` se a central não puder ser lida). */
export async function forkModel(doc: Pick<IAgenticFork, "centralId" | "modelOverride">): Promise<ModelChoiceDto | null> {
    try {
        const [{ settings }, { config }] = await Promise.all([loadAgenticSettings(), loadCentral(doc.centralId)])
        return toModelChoice(resolveAgent(settings, config, "fork"), asModelOverride(doc.modelOverride))
    } catch {
        return null
    }
}

/** Troca pedida → troca a gravar (`null` = voltar ao modelo do papel), conferida no OpenCode. */
export async function validatedModelOverride(input: ModelOverrideInput, label: string): Promise<ModelOverride | null> {
    if (!input.model) return null
    const override: ModelOverride = { model: input.model, variant: input.variant ?? null }
    await assertAgentConfigs([{ label, config: { agent: null, ...override } }], false)
    return override
}

/** Texto do modelo para avisos e auditoria ("anthropic/claude (high)" ou "modelo padrão do agente"). */
export function describeModel(choice: { model: string | null; variant: string | null }): string {
    if (!choice.model) return "modelo padrão do agente"
    return `${choice.model}${choice.variant ? ` (${choice.variant})` : ""}`
}
