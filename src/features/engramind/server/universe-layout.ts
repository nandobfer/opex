import { DomainError } from "@/lib/api/route"
import { DEFAULT_UNIVERSE_LAYOUT, parseUniverseLayout, sameUniverseLayout, type UniverseLayoutConfig } from "@engramind/client"
import { ENGRAMIND_STATE_ID, EngramindState, engramindDb, type IEngramindState } from "./models"
import { AcaoAuditoria, auditEngramind, engramindLog, publishEngramind } from "./shared"
import { UNIVERSE_LAYOUT_EVENT_TYPE } from "../constants"
import type { UniverseLayoutDto } from "../types"

/**
 * Layout dos universos de memórias (OPE-142, SOMENTE servidor): a configuração única que a rede
 * (`/engramind`), os universos de `/integracoes/ia` e a aba Memórias dos rotineiros usam. Fica no estado
 * da instalação (`engramind_state`); sem ela, vale o padrão da lib (anéis concêntricos).
 */

/** Configuração gravada, revalidada na leitura (gravação antiga inválida cai no padrão). */
async function readStored(): Promise<{ config: UniverseLayoutConfig; updatedAt: string | null } | null> {
    await engramindDb()
    const state = await EngramindState.findById(ENGRAMIND_STATE_ID).select({ universeLayout: 1 }).lean<Pick<IEngramindState, "universeLayout">>()
    const stored = state?.universeLayout
    if (!stored) return null
    const parsed = parseUniverseLayout(stored.config)
    if (!parsed.ok) {
        engramindLog.warn({ erros: parsed.errors.map((error) => error.path) }, "[engramind] layout do universo gravado é inválido; usando o padrão")
        return null
    }
    return { config: parsed.config, updatedAt: stored.updatedAt ? new Date(stored.updatedAt).toISOString() : null }
}

export async function getUniverseLayout(): Promise<UniverseLayoutDto> {
    const stored = await readStored()
    return stored ? { config: stored.config, isDefault: false, updatedAt: stored.updatedAt } : { config: DEFAULT_UNIVERSE_LAYOUT, isDefault: true, updatedAt: null }
}

/** Grava a configuração (modo restritivo: campo desconhecido ou fora do intervalo é recusado sem gravar nada). */
export async function saveUniverseLayout(input: unknown, actorId: string): Promise<UniverseLayoutDto> {
    const parsed = parseUniverseLayout(input)
    if (!parsed.ok) throw new DomainError(400, `Configuração inválida: ${parsed.errors.map((error) => error.message).join("; ")}`, "UNIVERSE_LAYOUT_INVALID", parsed.errors)
    const before = await getUniverseLayout()
    const updatedAt = new Date()
    await engramindDb()
    await EngramindState.updateOne({ _id: ENGRAMIND_STATE_ID }, { $set: { universeLayout: { config: parsed.config, updatedAt } } }, { upsert: true })
    await auditEngramind(actorId, "universe-layout", AcaoAuditoria.ATUALIZAR, { ...parsed.config }, { ...before.config })
    engramindLog.info({ iguaisAoPadrao: sameUniverseLayout(parsed.config, DEFAULT_UNIVERSE_LAYOUT) }, "[engramind] layout do universo gravado")
    await publishEngramind({ type: UNIVERSE_LAYOUT_EVENT_TYPE }, { live: false })
    return { config: parsed.config, isDefault: false, updatedAt: updatedAt.toISOString() }
}

/** Volta ao padrão da lib (apaga a configuração gravada). */
export async function resetUniverseLayout(actorId: string): Promise<UniverseLayoutDto> {
    const before = await getUniverseLayout()
    await engramindDb()
    await EngramindState.updateOne({ _id: ENGRAMIND_STATE_ID }, { $set: { universeLayout: null } }, { upsert: true })
    await auditEngramind(actorId, "universe-layout", AcaoAuditoria.ATUALIZAR, { ...DEFAULT_UNIVERSE_LAYOUT }, { ...before.config })
    engramindLog.info("[engramind] layout do universo restaurado ao padrão")
    await publishEngramind({ type: UNIVERSE_LAYOUT_EVENT_TYPE }, { live: false })
    return { config: DEFAULT_UNIVERSE_LAYOUT, isDefault: true, updatedAt: null }
}
