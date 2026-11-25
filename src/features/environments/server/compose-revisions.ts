import { DomainError } from "@/lib/api/route"
import { AcaoAuditoria, recordAudit } from "@/lib/db"
import { COMPOSE_REVISIONS_LIMIT, ENVIRONMENTS_AUDIT_ENTITY } from "../constants"
import { composeBytes } from "../managed-compose"
import type { ComposeSaveInput } from "../schemas"
import type { ComposeRevisionDto, ComposeRevisionSummaryDto, EnvironmentComposeDto } from "../types"
import { Environment, EnvironmentComposeVersion, environmentsDb, type IEnvironment, type IEnvironmentComposeVersion } from "./models"
import { assertComposeContent, loadEnvironment } from "./service"
import { envLog, publishEnvironment } from "./settings"

/**
 * Revisões do compose gerenciado (OPE-191), em `environment_compose_versions`. Cada gravação cria uma
 * revisão nova (v1, v2, …) e nunca sobrescreve uma anterior; restaurar cria outra revisão com o
 * conteúdo da escolhida. A vigente é a de maior `version` e vale a partir do próximo deploy.
 */

/** Tentativas quando duas gravações disputam o mesmo número (índice único `{ environmentId, version }`). */
const SAVE_ATTEMPTS = 5

function toSummary(item: IEnvironmentComposeVersion): ComposeRevisionSummaryDto {
    return {
        version: item.version,
        authorId: item.authorId,
        note: item.note ?? null,
        createdAt: new Date(item.createdAt).toISOString(),
        size: composeBytes(item.content ?? ""),
        deployedAt: item.deployedAt ? new Date(item.deployedAt).toISOString() : null,
    }
}

const toRevision = (item: IEnvironmentComposeVersion): ComposeRevisionDto => ({ ...toSummary(item), content: item.content })

async function loadManaged(id: string): Promise<IEnvironment & { source: Extract<IEnvironment["source"], { kind: "managed" }> }> {
    const env = await loadEnvironment(id)
    if (env.source.kind !== "managed") throw new DomainError(422, "Só ambientes de compose gerenciado têm revisões do compose", "ENVIRONMENT_NOT_MANAGED")
    return env as IEnvironment & { source: Extract<IEnvironment["source"], { kind: "managed" }> }
}

/** Revisão vigente (a de maior `version`); `null` quando o ambiente não tem nenhuma. */
export async function currentComposeRevision(environmentId: string): Promise<IEnvironmentComposeVersion | null> {
    await environmentsDb()
    return EnvironmentComposeVersion.findOne({ environmentId }).sort({ version: -1 }).lean<IEnvironmentComposeVersion>()
}

export async function listComposeRevisions(id: string): Promise<EnvironmentComposeDto> {
    const env = await loadManaged(id)
    const rows = await EnvironmentComposeVersion.find({ environmentId: id }).sort({ version: -1 }).limit(COMPOSE_REVISIONS_LIMIT).lean<IEnvironmentComposeVersion[]>()
    const current = rows[0] ?? null
    return { current: current ? toRevision(current) : null, revisions: rows.map(toSummary), deployedVersion: env.deployedComposeVersion ?? null }
}

export async function getComposeRevision(id: string, version: number): Promise<ComposeRevisionDto> {
    await loadManaged(id)
    const row = Number.isInteger(version) && version > 0 ? await EnvironmentComposeVersion.findOne({ environmentId: id, version }).lean<IEnvironmentComposeVersion>() : null
    if (!row) throw new DomainError(404, `Revisão v${version} do compose não encontrada`, "ENVIRONMENT_COMPOSE_NOT_FOUND")
    return toRevision(row)
}

const isDuplicateKey = (error: unknown) => typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000

/** Grava a revisão seguinte. Conteúdo igual ao da vigente é recusado (decisão do dono na OPE-191). */
async function appendRevision(id: string, content: string, note: string | null, actorId: string, restoredFrom: number | null): Promise<ComposeRevisionDto> {
    for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt++) {
        const latest = await currentComposeRevision(id)
        if (latest && latest.content === content) throw new DomainError(422, "O compose não mudou: a revisão vigente já tem este conteúdo", "ENVIRONMENT_COMPOSE_UNCHANGED")
        const version = (latest?.version ?? 0) + 1
        const now = new Date()
        try {
            const doc = await EnvironmentComposeVersion.create({ environmentId: id, version, content, authorId: actorId, note, createdAt: now, deployedAt: null })
            await Environment.updateOne({ _id: id, "source.kind": "managed", "source.composeVersion": { $lt: version } }, { $set: { "source.composeVersion": version, "source.composeUpdatedAt": now.toISOString(), updatedAt: now } })
            await recordAudit({
                userId: actorId,
                entidade: ENVIRONMENTS_AUDIT_ENTITY,
                entidadeId: id,
                acao: AcaoAuditoria.ATUALIZAR,
                antes: { compose: latest ? `v${latest.version}` : null },
                depois: { compose: `v${version}`, composeBytes: composeBytes(content), ...(restoredFrom ? { restauradaDe: `v${restoredFrom}` } : {}) },
            })
            envLog.info({ id, version, restoredFrom }, "[environments] Nova revisão do compose gerenciado")
            await publishEnvironment(id, "compose")
            return toRevision(doc.toObject() as IEnvironmentComposeVersion)
        } catch (error) {
            if (!isDuplicateKey(error)) throw error
        }
    }
    throw new DomainError(409, "Outra revisão do compose foi gravada ao mesmo tempo: tente de novo", "ENVIRONMENT_COMPOSE_CONFLICT")
}

/** Nova revisão escrita na tela. */
export async function saveComposeRevision(id: string, input: ComposeSaveInput, actorId: string): Promise<ComposeRevisionDto> {
    await loadManaged(id)
    assertComposeContent(input.content)
    return appendRevision(id, input.content, input.note?.trim() || null, actorId, null)
}

/** Restaura uma revisão antiga criando uma revisão nova com o conteúdo dela (o histórico fica). */
export async function restoreComposeRevision(id: string, version: number, actorId: string): Promise<ComposeRevisionDto> {
    const source = await getComposeRevision(id, version)
    return appendRevision(id, source.content, `Restaurada da v${version}`, actorId, version)
}

/** Deploy com sucesso: marca a revisão implantada (falha só vai para o log). */
export async function markComposeDeployed(environmentId: string, version: number): Promise<void> {
    await EnvironmentComposeVersion.updateOne({ environmentId, version }, { $set: { deployedAt: new Date() } }).catch((error: unknown) => envLog.warn({ err: error, environmentId, version }, "[environments] Falha ao marcar a revisão do compose como implantada"))
}

/** Apagar o ambiente: as revisões saem junto. */
export async function deleteComposeRevisions(environmentId: string): Promise<void> {
    await EnvironmentComposeVersion.deleteMany({ environmentId })
}
