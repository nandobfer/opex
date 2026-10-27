import { AcaoAuditoria, recordAudit } from "@/lib/db"
import type { LocalDockerOverrideMode } from "../schemas"
import type { LocalDockerOverrideDto } from "../types"
import { LocalDockerOverride, localDockerDb, type ILocalDockerOverride } from "./models"
import { localDockerLog, publishLocalDocker } from "./settings"
import { LOCAL_DOCKER_AUDIT_ENTITY } from "../constants"

/** Sobrescrita por central da chave global "Usar o PC quando o túnel estiver aberto". */

export async function getCentralOverride(centralId: string): Promise<LocalDockerOverrideDto> {
    await localDockerDb()
    const doc = await LocalDockerOverride.findOne({ centralId }).lean<ILocalDockerOverride>()
    return { centralId, mode: doc?.mode ?? "inherit" }
}

export async function setCentralOverride(centralId: string, mode: LocalDockerOverrideMode, actorId: string): Promise<LocalDockerOverrideDto> {
    const before = await getCentralOverride(centralId)
    if (before.mode === mode) return before
    if (mode === "inherit") await LocalDockerOverride.deleteOne({ centralId })
    else await LocalDockerOverride.updateOne({ centralId }, { $set: { mode, updatedAt: new Date() } }, { upsert: true })
    await recordAudit({ userId: actorId, entidade: LOCAL_DOCKER_AUDIT_ENTITY, entidadeId: centralId, acao: AcaoAuditoria.ATUALIZAR, antes: { maquinaLocal: before.mode }, depois: { maquinaLocal: mode } })
    localDockerLog.info({ centralId, mode }, "[local-docker] Sobrescrita da central salva")
    await publishLocalDocker("override")
    return { centralId, mode }
}

/** A central usa o PC com o túnel aberto? */
export function centralUsesLocal(mode: LocalDockerOverrideMode, useWhenOpen: boolean): boolean {
    return mode === "on" || (mode === "inherit" && useWhenOpen)
}
