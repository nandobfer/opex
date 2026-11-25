import { randomUUID } from "node:crypto"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { publishAppEvent } from "@/lib/pusher/channels"
import { SECRETARY_AUDIT_ENTITY, SECRETARY_PERSONALITY_EVENT } from "../constants"
import { diffPersonality, emptyPersonality, normalizePersonality, type PersonalitySnapshot } from "../personality"
import { SecretaryPersonality, SecretaryVersion, secretaryDb, type Version } from "./models"

export async function loadPersonality() {
    await secretaryDb()
    const doc = await SecretaryPersonality.findById("current").lean()
    return { versionId: doc?.versionId ?? null, snapshot: doc?.snapshot ?? { base: emptyPersonality(), variants: [] } }
}

export async function writeVersion(snapshot: PersonalitySnapshot, origin: Version["origin"], actor: string, expected?: string | null) {
    const previous = await loadPersonality()
    const next = { base: normalizePersonality(snapshot.base), variants: snapshot.variants }
    const id = randomUUID()
    const changes = diffPersonality(previous.snapshot, next)
    await SecretaryVersion.create({ _id: id, origin, snapshot: next, changes, at: new Date() })
    if (origin !== "analysis-cancelled") {
        const version = expected === undefined ? previous.versionId : expected
        const update = await SecretaryPersonality.updateOne(
            { _id: "current", ...(version ? { versionId: version } : { versionId: { $exists: false } }) },
            { $set: { snapshot: next, versionId: id } }, { upsert: !version },
        ).catch((error: unknown) => { if ((error as { code?: number }).code === 11000) return null; throw error })
        if (!update || !(update.matchedCount || update.upsertedCount)) {
            await SecretaryVersion.deleteOne({ _id: id })
            throw new DomainError(409, "A personalidade mudou. Atualize antes de gravar.", "SECRETARY_PERSONALITY_CHANGED")
        }
    }
    await recordAudit({ userId: actor, entidade: SECRETARY_AUDIT_ENTITY, entidadeId: id, acao: AcaoAuditoria.ATUALIZAR, depois: { origin, blocksChanged: changes.length } })
    await publishAppEvent(SECRETARY_PERSONALITY_EVENT, { versionId: id })
    return id
}

export async function restoreVersion(id: string, actor: string) {
    await secretaryDb()
    const version = await SecretaryVersion.findById(id).lean()
    if (!version) throw new DomainError(404, "Versão não encontrada.", "NOT_FOUND")
    return writeVersion(version.snapshot, "restore", actor)
}

export async function listPersonalityVersions() {
    await secretaryDb()
    return SecretaryVersion.find().sort({ at: -1 }).limit(50).select({ snapshot: 0 }).lean()
}
