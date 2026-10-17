import { Types } from "mongoose"
import { DomainError } from "@/lib/api/route"
import { logger } from "@/lib/logger"
import { Environment } from "@/lib/db/models/Environment"
import { EnvironmentImage } from "@/lib/db/models/EnvironmentImage"
import { EnvironmentOperation } from "@/lib/db/models/EnvironmentOperation"
import { AcaoAuditoria, recordAudit } from "@/lib/audit/record"
import { getEnvironmentSettings } from "@/features/ai/server/settings"
import { loadEnvironment, getRepoConfig } from "./service"
import { accessibleProject, type EnvironmentActor } from "./access"
import { restoreCompatibility } from "../logic"
import type { OperationInput } from "../schemas"
import { publishEnvironment } from "./events"

export async function requestOperation(actor: EnvironmentActor, repoId: string, envId: string, input: OperationInput) {
    const project = await accessibleProject(actor, repoId)
    const duplicate = await EnvironmentOperation.findOne({ actorId: actor.userId, requestId: input.requestId }).lean()
    if (duplicate) {
        if (duplicate.environmentId !== envId) throw new DomainError(409, "Confirmação já utilizada")
        return { id: String(duplicate._id) }
    }
    const env = await loadEnvironment(actor, repoId, envId)
    if (env.revision !== input.expectedRevision)
        throw new DomainError(409, "O ambiente mudou. Atualize e confirme novamente.")
    const config = await getRepoConfig(actor, repoId)
    const settings = await getEnvironmentSettings()
    if (!settings.availability.available)
        throw new DomainError(409, settings.availability.reason ?? "Configure Administração de sistema")
    if (input.kind === "restore") {
        const image = input.imageId
            ? await EnvironmentImage.findOne({ _id: input.imageId, environmentId: envId }).lean()
            : null
        if (!image?.images.length) throw new DomainError(404, "Imagem não encontrada")
        const compatibility = restoreCompatibility(env.dbVersion, image.dbVersion)
        if (compatibility === "blocked")
            throw new DomainError(
                409,
                "Imagem incompatível com a versão registrada do banco. Trocar imagem não restaura o banco.",
                "DB_INCOMPATIBLE",
            )
        if (compatibility === "unknown" && !input.riskConfirmed)
            throw new DomainError(409, "Confirme explicitamente o risco da versão de banco desconhecida", "DB_UNKNOWN")
    }
    if (input.kind !== "publish" && input.method === "cd")
        throw new DomainError(400, "CD disponível somente para publicação")
    if (input.method === "cd" && !config.config.workflow) throw new DomainError(409, "Configure o workflow de CD")
    const id = new Types.ObjectId()
    const reservation = await Environment.updateOne(
        { _id: envId, projectId: repoId, revision: input.expectedRevision, activeOperationId: null },
        { $set: { activeOperationId: String(id) } },
    )
    if (!reservation.modifiedCount) throw new DomainError(409, "Já existe uma operação ou o ambiente foi alterado")
    try {
        await EnvironmentOperation.create({
            _id: id,
            environmentId: envId,
            projectId: repoId,
            actorId: actor.userId,
            clientId: actor.clientId,
            requestId: input.requestId,
            kind: input.kind,
            method: input.method,
            state: "queued",
            stage: "Na fila",
            config: env.config,
            agentSettings: settings.settings,
            repoConfig: config.config,
            repoRevision: config.revision,
            environmentRevision: env.revision,
            repo: project.repo,
            repoUrl: project.repoUrl,
            imageId: input.imageId ?? null,
            riskConfirmed: input.riskConfirmed,
        })
    } catch (error) {
        await Environment.updateOne(
            { _id: envId, activeOperationId: String(id) },
            { $set: { activeOperationId: null } },
        )
        throw error
    }
    await recordAudit({
        userId: actor.userId,
        entidade: "AmbienteOperacao",
        entidadeId: String(id),
        acao: AcaoAuditoria.EXECUTAR,
        depois: { ambiente: envId, acao: input.kind, metodo: input.method },
    })
    await publishEnvironment(repoId, envId)
    const { pumpEnvironments } = await import("./queue")
    void pumpEnvironments().catch(() =>
        logger.warn("[environments] Operação persistida aguardando próximo tick da fila"),
    )
    return { id: String(id) }
}
