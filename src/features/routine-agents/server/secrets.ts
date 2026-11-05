import { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { decryptSecret, encryptSecret, isEncryptedSecret } from "@/lib/crypto/secretBox"
import { RoutineAgentSecret, type IRoutineAgentSecret } from "@/lib/db/models/RoutineAgent"
import type { HttpSecretVault } from "@/features/http-request/schemas"
import { MAX_ROUTINE_SECRETS, type RoutineSecretCreateInput, type RoutineSecretUpdateInput } from "../schemas"
import type { RoutineSecretDto } from "../types"
import { AcaoAuditoria, loadAgentDoc, messageOf, publishAgentUpdated, routineDb, routineLog } from "./shared"
import { recordAudit } from "@/lib/db"

/**
 * Segredos do agente rotineiro (OPE-130, D5: aba "Segredos" da página do agente, só daquele agente).
 * O valor **só entra**: é cifrado (`secretBox`) e nenhuma resposta, DTO, auditoria, log ou evento o
 * traz (nem pedaços). O agente vê só o nome, a descrição e os domínios, e usa o segredo na "Chamada
 * HTTP" por `{{secret:NOME}}` — o servidor troca pelo valor no envio e mascara o que volta.
 */

export const ROUTINE_SECRET_AUDIT_ENTITY = "SegredoAgenteRotineiro"

type SecretDoc = IRoutineAgentSecret & { _id: Types.ObjectId }

const NOT_FOUND = () => new DomainError(404, "Segredo não encontrado", "ROUTINE_SECRET_NOT_FOUND")
const NAME_TAKEN = () => new DomainError(409, "Já existe um segredo com esse nome neste agente", "ROUTINE_SECRET_NAME_TAKEN")
const isDuplicateKey = (error: unknown) => typeof error === "object" && error !== null && (error as { code?: number }).code === 11000

const iso = (value: Date | null | undefined) => (value ? new Date(value).toISOString() : null)

export const toSecretDto = (doc: SecretDoc): RoutineSecretDto => ({
    id: String(doc._id),
    name: doc.name,
    description: doc.description ?? "",
    allowedHosts: doc.allowedHosts ?? [],
    lastUsedAt: iso(doc.lastUsedAt),
    createdAt: new Date(doc.createdAt).toISOString(),
    updatedAt: new Date(doc.updatedAt).toISOString(),
})

const auditView = (doc: { name: string; description: string; allowedHosts: string[] }) => ({ nome: doc.name, descricao: doc.description, dominios: doc.allowedHosts })

async function audit(actorId: string, secretId: string, acao: (typeof AcaoAuditoria)[keyof typeof AcaoAuditoria], data: { antes?: Record<string, unknown>; depois?: Record<string, unknown> }, agentId: string) {
    await recordAudit({ userId: actorId, entidade: ROUTINE_SECRET_AUDIT_ENTITY, entidadeId: secretId, acao, ...(data.antes ? { antes: { ...data.antes, agente: agentId } } : {}), ...(data.depois ? { depois: { ...data.depois, agente: agentId } } : {}) })
}

export async function listRoutineSecrets(agentId: string): Promise<RoutineSecretDto[]> {
    const agent = await loadAgentDoc(agentId)
    const rows = await RoutineAgentSecret.find({ agentId: agent._id }).sort({ name: 1 }).lean<SecretDoc[]>()
    return rows.map(toSecretDto)
}

async function loadSecret(agentId: string, secretId: string): Promise<SecretDoc> {
    if (!Types.ObjectId.isValid(secretId)) throw NOT_FOUND()
    const doc = await RoutineAgentSecret.findOne({ _id: secretId, agentId }).lean<SecretDoc | null>()
    if (!doc) throw NOT_FOUND()
    return doc
}

export async function createRoutineSecret(agentId: string, input: RoutineSecretCreateInput, actorId: string): Promise<RoutineSecretDto> {
    const agent = await loadAgentDoc(agentId)
    if ((await RoutineAgentSecret.countDocuments({ agentId: agent._id })) >= MAX_ROUTINE_SECRETS) throw new DomainError(409, `No máximo ${MAX_ROUTINE_SECRETS} segredos por agente`, "ROUTINE_SECRET_LIMIT")
    if (await RoutineAgentSecret.findOne({ agentId: agent._id, name: input.name }).lean()) throw NAME_TAKEN()
    let doc: SecretDoc
    try {
        const created = await RoutineAgentSecret.create({ agentId: agent._id, name: input.name, description: input.description, allowedHosts: input.allowedHosts, value: encryptSecret(input.value), lastUsedAt: null })
        doc = created.toObject() as SecretDoc
    } catch (error) {
        if (isDuplicateKey(error)) throw NAME_TAKEN()
        throw error
    }
    await audit(actorId, String(doc._id), AcaoAuditoria.CRIAR, { depois: auditView(input) }, agentId)
    await publishAgentUpdated(agentId)
    return toSecretDto(doc)
}

export async function updateRoutineSecret(agentId: string, secretId: string, input: RoutineSecretUpdateInput, actorId: string): Promise<RoutineSecretDto> {
    const agent = await loadAgentDoc(agentId)
    const before = await loadSecret(String(agent._id), secretId)
    if (input.name !== before.name && (await RoutineAgentSecret.findOne({ agentId: agent._id, name: input.name }).lean())) throw NAME_TAKEN()
    const set: Record<string, unknown> = { name: input.name, description: input.description, allowedHosts: input.allowedHosts }
    // Valor vazio mantém o atual.
    if (input.value) set.value = encryptSecret(input.value)
    try {
        await RoutineAgentSecret.updateOne({ _id: before._id }, { $set: set })
    } catch (error) {
        if (isDuplicateKey(error)) throw NAME_TAKEN()
        throw error
    }
    await audit(actorId, secretId, AcaoAuditoria.ATUALIZAR, { antes: auditView(before), depois: { ...auditView(input), valorTrocado: Boolean(input.value) } }, agentId)
    await publishAgentUpdated(agentId)
    return toSecretDto(await loadSecret(String(agent._id), secretId))
}

export async function deleteRoutineSecret(agentId: string, secretId: string, actorId: string): Promise<{ id: string }> {
    const agent = await loadAgentDoc(agentId)
    const before = await loadSecret(String(agent._id), secretId)
    await RoutineAgentSecret.deleteOne({ _id: before._id })
    await audit(actorId, secretId, AcaoAuditoria.EXCLUIR, { antes: auditView(before) }, agentId)
    await publishAgentUpdated(agentId)
    return { id: secretId }
}

/** Nome, descrição e domínios (sem valor) para as instruções do agente. */
export async function routineSecretCatalog(agentId: string | Types.ObjectId): Promise<{ name: string; description: string; allowedHosts: string[] }[]> {
    await routineDb()
    const rows = await RoutineAgentSecret.find({ agentId }).select({ name: 1, description: 1, allowedHosts: 1 }).sort({ name: 1 }).lean<SecretDoc[]>()
    return rows.map((row) => ({ name: row.name, description: row.description ?? "", allowedHosts: row.allowedHosts ?? [] }))
}

/**
 * Cofre da ativação: lido na hora do turno (uma edição vale na próxima ativação). Os valores só
 * existem em memória, para a "Chamada HTTP" trocar os marcadores e mascarar a resposta.
 */
export async function loadRoutineSecretVault(agentId: string | Types.ObjectId): Promise<HttpSecretVault> {
    await routineDb()
    const rows = await RoutineAgentSecret.find({ agentId }).sort({ name: 1 }).lean<SecretDoc[]>()
    const values = new Map<string, string>()
    for (const row of rows) {
        try {
            if (isEncryptedSecret(row.value)) values.set(row.name, decryptSecret(row.value))
        } catch (error) {
            routineLog.warn({ agentId: String(agentId), secret: row.name, err: messageOf(error) }, "[routine-agents] segredo não pôde ser decifrado")
        }
    }
    const list = rows.filter((row) => values.has(row.name)).map((row) => ({ name: row.name, description: row.description ?? "", allowedHosts: row.allowedHosts ?? [] }))
    return {
        list: () => list,
        value: (name) => values.get(name),
        markUsed: (names) => {
            void RoutineAgentSecret.updateMany({ agentId, name: { $in: names } }, { $set: { lastUsedAt: new Date() } }).catch((error: unknown) =>
                routineLog.warn({ agentId: String(agentId), err: messageOf(error) }, "[routine-agents] último uso do segredo não gravado"),
            )
        },
    }
}
