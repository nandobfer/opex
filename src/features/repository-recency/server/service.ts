import { DomainError } from "@/lib/api/route"
import { dbConnect } from "@/lib/db"
import { RepositorySelection } from "@/lib/db/models/RepositorySelection"
import { loggerFor } from "@/lib/logger"
import { repoRecentsChannel } from "@/lib/pusher/channel-names"
import { publishToChannels } from "@/lib/pusher/channels"
import { REPO_RECENTS_UPDATED_EVENT } from "../constants"
import type { RepoRecentsDto } from "../types"

/**
 * Histórico de repositórios usados recentemente (SOMENTE servidor).
 *
 * `actorId` é resolvido pela sessão e `allowed` são os repositórios que o ator pode usar **neste
 * contexto** (todos, para o dono; os do cliente em escopo, no portal). O histórico nunca concede
 * acesso: ids fora de `allowed` são ignorados na leitura e recusados no registro.
 */

const log = loggerFor({ feature: "repository-recency" })

/** Ids usados recentemente (do mais recente para o mais antigo), restrito aos permitidos. */
export async function listRepoRecents(actorId: string, allowed: ReadonlySet<string>): Promise<string[]> {
    await dbConnect()
    const docs = await RepositorySelection.find({ actorId }).sort({ lastSelectedAt: -1 }).lean()
    return docs.map((doc) => doc.projectId).filter((id) => allowed.has(id))
}

/** Histórico do ator com o canal privado de tempo real. */
export async function getRepoRecents(actorId: string, allowed: ReadonlySet<string>): Promise<RepoRecentsDto> {
    return { projectIds: await listRepoRecents(actorId, allowed), channel: repoRecentsChannel(actorId) }
}

/**
 * Registra o uso do repositório (idempotente por ator/repositório) e avisa as outras abas e
 * dispositivos do **mesmo** ator. A falha de tempo real não desfaz o registro já persistido.
 */
export async function recordRepoRecent(actorId: string, projectId: string, allowed: ReadonlySet<string>): Promise<RepoRecentsDto> {
    if (!allowed.has(projectId)) throw new DomainError(400, "Repositório não disponível", "PROJECT_NOT_ALLOWED")
    await dbConnect()
    await RepositorySelection.updateOne({ actorId, projectId }, { $set: { lastSelectedAt: new Date() } }, { upsert: true })
    log.debug({ actorId, projectId }, "[repository-recency] repositório marcado como recente")
    await publishToChannels([repoRecentsChannel(actorId)], REPO_RECENTS_UPDATED_EVENT, { projectId })
    return getRepoRecents(actorId, allowed)
}
