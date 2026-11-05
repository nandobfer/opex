import { RoutineAgentSettings } from "@/lib/db/models/RoutineAgent"
import { DEFAULT_ROUTINE_AGENT_SETTINGS, routineAgentSettingsShape, type RoutineAgentSettingsInput } from "../schemas"
import { AcaoAuditoria, publishAgentUpdated, routineDb } from "./shared"
import { recordAudit } from "@/lib/db"

/**
 * Configuração geral dos agentes rotineiros (OPE-130): o provedor/modelo do **subagente de
 * provisionamento** (decisão D2 do plano aprovado — configuração própria, no topo da aba Rotineiros).
 */

const SETTINGS_ID = "default"

export async function loadRoutineAgentSettings(): Promise<RoutineAgentSettingsInput> {
    await routineDb()
    const doc = await RoutineAgentSettings.findById(SETTINGS_ID).lean()
    if (!doc) return DEFAULT_ROUTINE_AGENT_SETTINGS
    const parsed = routineAgentSettingsShape.safeParse({ provider: doc.provider ?? null, model: doc.model ?? "", variant: doc.variant ?? null, agent: doc.agent ?? null })
    return parsed.success ? parsed.data : DEFAULT_ROUTINE_AGENT_SETTINGS
}

export async function saveRoutineAgentSettings(input: RoutineAgentSettingsInput, actorId: string): Promise<RoutineAgentSettingsInput> {
    await routineDb()
    const before = await loadRoutineAgentSettings()
    await RoutineAgentSettings.updateOne({ _id: SETTINGS_ID }, { $set: input }, { upsert: true })
    await recordAudit({ userId: actorId, entidade: "AgenteRotineiroConfig", entidadeId: SETTINGS_ID, acao: AcaoAuditoria.ATUALIZAR, antes: { ...before }, depois: { ...input } })
    await publishAgentUpdated("settings")
    return input
}
