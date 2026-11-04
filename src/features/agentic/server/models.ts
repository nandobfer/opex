import type { IAgenticFork, IAgenticWorkbench } from "@/lib/db/models/Agentic"
import { WORKBENCH_MODEL_ROLE_LABELS, WORKBENCH_MODEL_ROLES, type AgentRole, type WorkbenchModelRole } from "../constants"
import { loadTaskRefinementSettings } from "@/features/ai/server/settings"
import { applyModelOverride, asModelOverride, modelSource, resolveAgent, roleBaseAgent, roleModelSource, toModelChoice, type ModelOverride, type RefinerAgent } from "../logic"
import type { AgentConfig, AgenticSettings, CentralConfig, ModelOverrideInput } from "../schemas"
import type { ModelChoiceDto, ModelSourceDto, WorkbenchModelsDto } from "../types"
import { loadCentral } from "./centrals"
import { assertAgentConfigs, loadAgenticSettings } from "./settings"

/**
 * Troca do modelo na mesa e no fork (SOMENTE servidor): resolve o modelo efetivo de cada papel
 * (configuração do papel + troca gravada) e valida a troca no OpenCode.
 */

/** A escolha da tela (`toModelChoice`) também é usada pelo cliente na etapa inicial da mesa; mantida aqui por compatibilidade. */
export { toModelChoice }

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

/** Modelo de um papel da mesa para a tela (central/global ou Agente Refinador + troca da mesa). */
export function workbenchModelChoice(settings: AgenticSettings, config: Pick<CentralConfig, "agents">, doc: Pick<IAgenticWorkbench, "modelOverrides">, role: WorkbenchModelRole, refiner: RefinerAgent | null = null): ModelChoiceDto {
    return toModelChoice(roleBaseAgent(settings, config, role, refiner), workbenchOverrides(doc)[role] ?? null, roleModelSource(config, role))
}

/** Modelo configurado no Agente Refinador (base do papel "Refinamento"); `null` se não puder ser lido. */
export async function refinerAgent(): Promise<RefinerAgent | null> {
    try {
        const { settings } = await loadTaskRefinementSettings()
        return { agent: settings.agent ?? null, model: settings.model ?? null, variant: settings.variant ?? null }
    } catch {
        return null
    }
}

/** Agente do turno do refinamento na mesa: o do Agente Refinador com a troca "Refinamento" da mesa. */
export async function refinementTurnAgent(doc: Pick<IAgenticWorkbench, "modelOverrides">): Promise<AgentConfig> {
    const refiner = await refinerAgent()
    return applyModelOverride({ agent: refiner?.agent ?? null, model: refiner?.model ?? null, variant: refiner?.variant ?? null, fallbacks: [] }, workbenchOverrides(doc).refinement ?? null)
}

/**
 * Modelos efetivos dos papéis da mesa (`null` se a central não puder ser lida). O "Refinamento" só entra
 * enquanto a mesa está no refinamento (OPE-137): depois dele não há mais turno do Agente Refinador.
 */
export async function workbenchModels(doc: Pick<IAgenticWorkbench, "centralId" | "modelOverrides"> & Partial<Pick<IAgenticWorkbench, "stage">>): Promise<WorkbenchModelsDto | null> {
    try {
        const refining = doc.stage === "refining" || doc.stage === "spec_ready"
        const [{ settings }, { config }, refiner] = await Promise.all([loadAgenticSettings(), loadCentral(doc.centralId), refining ? refinerAgent() : Promise.resolve(null)])
        const roles = WORKBENCH_MODEL_ROLES.filter((role) => refining || role !== "refinement")
        return Object.fromEntries(roles.map((role) => [role, workbenchModelChoice(settings, config, doc, role, refiner)])) as WorkbenchModelsDto
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

/**
 * Trocas escolhidas na etapa inicial da mesa (OPE-134): confere todos os modelos numa única chamada
 * ao OpenCode (modelo/variante inexistente → 400) e devolve o que será gravado em `modelOverrides`.
 */
export async function validatedStartOverrides(input: Partial<Record<WorkbenchModelRole, ModelOverrideInput>> | null | undefined): Promise<Partial<Record<WorkbenchModelRole, ModelOverride>>> {
    const entries: { role: WorkbenchModelRole; model: string; variant: string | null }[] = []
    for (const role of WORKBENCH_MODEL_ROLES) {
        const value = input?.[role]
        if (value?.model) entries.push({ role, model: value.model, variant: value.variant ?? null })
    }
    if (!entries.length) return {}
    await assertAgentConfigs(
        entries.map((entry) => ({ label: WORKBENCH_MODEL_ROLE_LABELS[entry.role], config: { agent: null, model: entry.model, variant: entry.variant } })),
        false,
    )
    return Object.fromEntries(entries.map((entry) => [entry.role, { model: entry.model, variant: entry.variant }])) as Partial<Record<WorkbenchModelRole, ModelOverride>>
}

/** Texto do modelo para avisos e auditoria ("anthropic/claude (high)" ou "modelo padrão do agente"). */
export function describeModel(choice: { model: string | null; variant: string | null }): string {
    if (!choice.model) return "modelo padrão do agente"
    return `${choice.model}${choice.variant ? ` (${choice.variant})` : ""}`
}
