import { dbConnect } from "@/lib/db"
import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, recordAudit } from "@/lib/audit/record"
import { encryptSecret, decryptSecret } from "@/lib/crypto/secretBox"
import { Environment, type IEnvironment } from "@/lib/db/models/Environment"
import { EnvironmentRepoConfig } from "@/lib/db/models/EnvironmentRepoConfig"
import { EnvironmentOperation } from "@/lib/db/models/EnvironmentOperation"
import { EnvironmentImage } from "@/lib/db/models/EnvironmentImage"
import { DEFAULT_REPO_CONFIG, type EnvironmentInput, type RepoConfigInput, objectIdSchema } from "../schemas"
import type { EnvironmentDetail, EnvironmentDto, RepoConfigDto } from "../types"
import { accessibleProject, assertEdit, type EnvironmentActor } from "./access"
import { publishEnvironment } from "./events"

export function environmentDto(doc: IEnvironment & { _id: unknown }): EnvironmentDto {
    return {
        ...doc.config,
        variables: doc.config.variables.map((v) => ({ ...v, value: v.secret ? "" : v.value })),
        id: String(doc._id),
        projectId: doc.projectId,
        revision: doc.revision,
        dbVersion: doc.dbVersion,
        observedAt: doc.observedAt?.toISOString() ?? null,
        compose: doc.compose,
        activeOperationId: doc.activeOperationId,
    }
}
export async function loadEnvironment(actor: EnvironmentActor, repoId: string, id: string) {
    await accessibleProject(actor, repoId)
    if (!objectIdSchema.safeParse(id).success) throw new DomainError(400, "Ambiente inválido")
    const env = await Environment.findOne({ _id: id, projectId: repoId }).lean()
    if (!env) throw new DomainError(404, "Ambiente não encontrado")
    return env
}
export async function listEnvironments(actor: EnvironmentActor, repoId: string) {
    await accessibleProject(actor, repoId)
    return (await Environment.find({ projectId: repoId }).sort({ "config.name": 1 }).lean()).map(environmentDto)
}
export async function getRepoConfig(actor: EnvironmentActor, repoId: string): Promise<RepoConfigDto> {
    await accessibleProject(actor, repoId)
    const doc = await EnvironmentRepoConfig.findOne({ projectId: repoId }).select("+secrets").lean()
    return {
        config: doc?.config ?? DEFAULT_REPO_CONFIG,
        revision: doc?.revision ?? 0,
        secretsConfigured: Boolean(doc?.secrets),
        canEdit: actor.canEdit,
        canManageSecrets: actor.owner,
    }
}
export async function saveRepoConfig(
    actor: EnvironmentActor,
    repoId: string,
    config: RepoConfigInput,
    revision: number,
) {
    assertEdit(actor)
    await accessibleProject(actor, repoId)
    const current = await getRepoConfig(actor, repoId)
    if (current.revision !== revision) throw new DomainError(409, "Configuração alterada. Atualize a página.")
    // Host/usuário/known_hosts mudam o destino das credenciais: restritos ao dono.
    if (
        !actor.owner &&
        JSON.stringify({ ...config, workflow: "" }) !== JSON.stringify({ ...current.config, workflow: "" })
    )
        throw new DomainError(403, "Somente o dono altera o acesso ao host")
    if (await EnvironmentOperation.exists({ projectId: repoId, state: { $in: ["queued", "running", "reconciling"] } }))
        throw new DomainError(409, "Aguarde as operações em andamento")
    if (!(await EnvironmentRepoConfig.exists({ projectId: repoId }))) {
        try {
            await EnvironmentRepoConfig.create({ projectId: repoId, config, revision: 1, updatedBy: actor.userId })
        } catch {
            throw new DomainError(409, "Configuração alterada. Atualize a página.")
        }
    } else {
        const result = await EnvironmentRepoConfig.updateOne(
            { projectId: repoId, revision },
            { $set: { config, updatedBy: actor.userId }, $inc: { revision: 1 } },
        )
        if (!result.modifiedCount) throw new DomainError(409, "Configuração alterada. Atualize a página.")
    }
    await recordAudit({
        userId: actor.userId,
        entidade: "AmbienteRepositorio",
        entidadeId: repoId,
        acao: AcaoAuditoria.ATUALIZAR,
        depois: { config },
    })
    await publishEnvironment(repoId)
    return getRepoConfig(actor, repoId)
}
export async function saveSshSecrets(actor: EnvironmentActor, repoId: string, input: Record<string, string>) {
    if (!actor.owner) throw new DomainError(403, "Somente o dono configura credenciais SSH")
    await accessibleProject(actor, repoId)
    const current = await EnvironmentRepoConfig.findOne({ projectId: repoId }).select("+secrets").lean()
    if (!current) throw new DomainError(409, "Salve a configuração do repositório primeiro")
    if (await EnvironmentOperation.exists({ projectId: repoId, state: { $in: ["queued", "running", "reconciling"] } }))
        throw new DomainError(409, "Aguarde as operações em andamento")
    const previous = current.secrets ? (JSON.parse(decryptSecret(current.secrets)) as Record<string, string>) : {}
    await EnvironmentRepoConfig.updateOne(
        { _id: current._id, revision: current.revision },
        {
            $set: { secrets: encryptSecret(JSON.stringify({ ...previous, ...input })), updatedBy: actor.userId },
            $inc: { revision: 1 },
        },
    )
    await recordAudit({
        userId: actor.userId,
        entidade: "AmbienteRepositorio",
        entidadeId: repoId,
        acao: AcaoAuditoria.ATUALIZAR,
        depois: { credenciais: "(substituídas)" },
    })
    await publishEnvironment(repoId)
    return { configured: true }
}
export async function saveEnvironment(
    actor: EnvironmentActor,
    repoId: string,
    input: EnvironmentInput,
    id?: string,
    revision?: number,
) {
    assertEdit(actor)
    await accessibleProject(actor, repoId)
    const current = id ? await loadEnvironment(actor, repoId, id) : null
    if (current?.activeOperationId) throw new DomainError(409, "Aguarde a operação em andamento")
    if (current && current.revision !== revision) throw new DomainError(409, "Ambiente alterado. Atualize a página.")
    if (current && input.slug !== current.slug)
        throw new DomainError(409, "O slug identifica os recursos no host e não pode ser alterado")
    const oldSecrets = current ? await Environment.findById(current._id).select("+secretVariables").lean() : null
    const values: Record<string, string> = oldSecrets?.secretVariables
        ? JSON.parse(decryptSecret(oldSecrets.secretVariables))
        : {}
    const next: Record<string, string> = {}
    for (const variable of input.variables) {
        const old = current?.config.variables.find((v) => v.name === variable.name)
        if (!actor.owner && (variable.secret !== Boolean(old?.secret) || (variable.secret && variable.value)))
            throw new DomainError(403, "Somente o dono define variáveis secretas")
        if (variable.secret) {
            const value = variable.value || values[variable.name]
            if (value === undefined) throw new DomainError(400, `Defina o valor de ${variable.name}`)
            next[variable.name] = value
        }
    }
    if (!actor.owner && Object.keys(values).some((k) => !(k in next)))
        throw new DomainError(403, "Somente o dono remove variáveis secretas")
    const config = { ...input, variables: input.variables.map((v) => ({ ...v, value: v.secret ? "" : v.value })) }
    const data = {
        projectId: repoId,
        slug: input.slug,
        config,
        secretVariables: Object.keys(next).length ? encryptSecret(JSON.stringify(next)) : null,
        updatedBy: actor.userId,
    }
    let savedId: string
    try {
        if (current) {
            const updated = await Environment.updateOne(
                { _id: current._id, revision, activeOperationId: null },
                { $set: data, $inc: { revision: 1 } },
            )
            if (!updated.modifiedCount) throw new DomainError(409, "Ambiente alterado. Atualize a página.")
            savedId = String(current._id)
        } else savedId = String((await Environment.create({ ...data, createdBy: actor.userId }))._id)
    } catch (error) {
        if (error instanceof DomainError) throw error
        if (error && typeof error === "object" && "code" in error && error.code === 11000)
            throw new DomainError(409, "Já existe um ambiente com esse slug")
        throw error
    }
    await recordAudit({
        userId: actor.userId,
        entidade: "Ambiente",
        entidadeId: savedId,
        acao: current ? AcaoAuditoria.ATUALIZAR : AcaoAuditoria.CRIAR,
        depois: { nome: config.name, branch: config.branch, variaveis: config.variables.map((v) => v.name) },
    })
    await publishEnvironment(repoId, savedId)
    return environmentDto((await Environment.findById(savedId).lean())!)
}
export async function environmentDetail(
    actor: EnvironmentActor,
    repoId: string,
    id: string,
): Promise<EnvironmentDetail> {
    await dbConnect()
    const env = await loadEnvironment(actor, repoId, id)
    const operations = await EnvironmentOperation.find({ environmentId: id }).sort({ createdAt: -1 }).limit(50).lean()
    const images = await EnvironmentImage.find({ environmentId: id }).sort({ builtAt: -1 }).limit(100).lean()
    return {
        environment: environmentDto(env),
        canEdit: actor.canEdit,
        canManageSecrets: actor.owner,
        operations: operations.map((op) => ({
            id: String(op._id),
            environmentId: id,
            kind: op.kind,
            state: op.state,
            stage: op.stage,
            steps: (op.steps ?? []).map((step) => ({ name: step.name, at: step.at.toISOString() })),
            error: op.error,
            failureCode: op.failureCode ?? null,
            createdAt: op.createdAt.toISOString(),
            finishedAt: op.finishedAt?.toISOString() ?? null,
            sessionId: actor.owner ? op.sessionId : null,
            evidence: op.evidence,
            migrations: op.migrations,
            runUrl: op.runUrl,
        })),
        images: images.map((im) => ({
            id: String(im._id),
            version: im.version,
            dbVersion: im.dbVersion,
            builtAt: im.builtAt?.toISOString() ?? null,
            origin: im.origin,
            images: im.images,
        })),
    }
}
