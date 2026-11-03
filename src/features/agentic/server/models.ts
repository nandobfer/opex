import type { IAgenticFork, IAgenticWorkbench } from "@/lib/db/models/Agentic"
import { WORKBENCH_MODEL_ROLES, type AgentRole, type WorkbenchModelRole } from "../constants"
import { applyModelOverride, asModelOverride, modelSource, resolveAgent, type ModelOverride } from "../logic"
import type { AgentConfig, AgenticSettings, CentralConfig, ModelOverrideInput } from "../schemas"
import type { ModelChoiceDto, ModelSourceDto } from "../types"
import { loadCentral } from "./centrals"
import { assertAgentConfigs, loadAgenticSettings } from "./settings"

/**
 * Troca do modelo na mesa e no fork (SOMENTE servidor): resolve o modelo efetivo de cada papel
 * (configuração do papel + troca gravada) e valida a troca no OpenCode.
 */

/** Modelo/variante para a tela (variante só com modelo definido). */
const choiceOf = (agent: AgentConfig) => ({ model: agent.model, variant: agent.model ? agent.variant : null })

/**
 * Modelo efetivo de um papel para a tela: o do papel ou o trocado, com o valor herdado (sem a troca)
 * e a origem. `source`/`overrideSource` seguem a precedência fork > mesa > central > global.
 */
export function toModelChoice(base: AgentConfig, override: ModelOverride | null, baseSource?: ModelSourceDto, overrideSource: ModelSourceDto = "workbench"): ModelChoiceDto {
    const effective = applyModelOverride(base, override)
    return {
        ...choiceOf(effective),
        overridden: Boolean(override),
        inherited: choiceOf(base),
        ...(baseSource ? { source: override ? overrideSource : baseSource, inheritedSource: baseSource } : {}),
    }
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

/** Modelo de um papel da mesa para a tela (central/global + troca da mesa). */
export function workbenchModelChoice(settings: AgenticSettings, config: Pick<CentralConfig, "agents">, doc: Pick<IAgenticWorkbench, "modelOverrides">, role: WorkbenchModelRole): ModelChoiceDto {
    return toModelChoice(resolveAgent(settings, config, role), workbenchOverrides(doc)[role] ?? null, modelSource(config, role))
}

/** Modelos efetivos dos papéis da mesa (`null` se a central não puder ser lida). */
export async function workbenchModels(doc: Pick<IAgenticWorkbench, "centralId" | "modelOverrides">): Promise<Record<WorkbenchModelRole, ModelChoiceDto> | null> {
    try {
        const [{ settings }, { config }] = await Promise.all([loadAgenticSettings(), loadCentral(doc.centralId)])
        return Object.fromEntries(WORKBENCH_MODEL_ROLES.map((role) => [role, workbenchModelChoice(settings, config, doc, role)])) as Record<WorkbenchModelRole, ModelChoiceDto>
    } catch {
        return null
    }
}

/**
 * Agente base dos forks de uma mesa: o papel Fork (central/global) com a troca "Fork" da mesa
 * aplicada. A troca do próprio fork vai por cima (fork > mesa > central > global).
 */
export function forkBaseAgent(settings: AgenticSettings, config: Pick<CentralConfig, "agents">, workbench: Pick<IAgenticWorkbench, "modelOverrides"> | null): AgentConfig {
    return applyModelOverride(resolveAgent(settings, config, "fork"), workbench ? (workbenchOverrides(workbench).fork ?? null) : null)
}

/** Modelo de um fork para a tela: herdado = Fork da mesa (ou central/global), origem `fork` quando trocado nele. */
export function forkModelChoice(settings: AgenticSettings, config: Pick<CentralConfig, "agents">, workbench: Pick<IAgenticWorkbench, "modelOverrides"> | null, fork: Pick<IAgenticFork, "modelOverride">): ModelChoiceDto {
    const baseSource: ModelSourceDto = workbench && workbenchOverrides(workbench).fork ? "workbench" : modelSource(config, "fork")
    return toModelChoice(forkBaseAgent(settings, config, workbench), asModelOverride(fork.modelOverride), baseSource, "fork")
}

/** Modelo efetivo de um fork (`null` se a central não puder ser lida). */
export async function forkModel(doc: Pick<IAgenticFork, "centralId" | "modelOverride">, workbench: Pick<IAgenticWorkbench, "modelOverrides"> | null): Promise<ModelChoiceDto | null> {
    try {
        const [{ settings }, { config }] = await Promise.all([loadAgenticSettings(), loadCentral(doc.centralId)])
        return forkModelChoice(settings, config, workbench, doc)
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
