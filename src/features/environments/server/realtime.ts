import { dbConnect } from "@/lib/db"
import { Environment } from "@/lib/db/models/Environment"
import { OrcamentoClient } from "@/lib/db/models/Orcamento"
import { appChannel, clientChannel, environmentChannel, publishToChannels } from "@/lib/pusher/channels"
import type { SessionPayload } from "@/features/auth/session"
import type { IEnvironmentOperation } from "@/lib/db/models/EnvironmentOperation"
import { ENVIRONMENT_LOG_EVENT, ENVIRONMENT_OPERATION_EVENT, ENVIRONMENTS_UPDATED_EVENT } from "../constants"
import type { EnvironmentLogLine } from "../types"
import { toOperationDto } from "./dto"

/**
 * Tempo real do módulo Ambientes (SOMENTE servidor): publica no canal do app, nos canais dos
 * clientes com acesso ao projeto e no canal do ambiente (`private-environment-{id}`). Também decide
 * se uma sessão de cliente pode assinar o canal de um ambiente (repositório vinculado ao cliente).
 */

export async function publishEnvironmentsUpdated(projectId: string, scope = "environments"): Promise<void> {
    const channels = [appChannel()]
    try {
        await dbConnect()
        const clients = await OrcamentoClient.find({ active: true, projectIds: projectId }).select({ _id: 1 }).lean()
        for (const client of clients) channels.push(clientChannel(String(client._id)))
    } catch {
        // Banco indisponível: segue só com o canal do app.
    }
    await publishToChannels(channels, ENVIRONMENTS_UPDATED_EVENT, { scope, projectId })
}

export async function publishOperationEvent(operation: IEnvironmentOperation, queuePosition: number | null = null): Promise<void> {
    const dto = toOperationDto(operation)
    dto.queuePosition = queuePosition
    await publishToChannels([environmentChannel(operation.environmentId), appChannel()], ENVIRONMENT_OPERATION_EVENT, {
        environmentId: operation.environmentId,
        projectId: operation.projectId,
        operation: dto,
    })
}

export async function publishEnvironmentLogs(environmentId: string, lines: EnvironmentLogLine[]): Promise<void> {
    if (lines.length === 0) return
    await publishToChannels([environmentChannel(environmentId)], ENVIRONMENT_LOG_EVENT, { entries: lines })
}

/** Autoriza a assinatura do canal de um ambiente pela sessão (o dono sempre; o cliente se tiver o projeto). */
export async function isEnvironmentChannelAuthorized(environmentId: string, session: SessionPayload | null): Promise<boolean> {
    if (!session) return false
    if (session.kind === "admin") return true
    if (session.kind !== "client" || !session.clientId) return false
    await dbConnect()
    const env = await Environment.findById(environmentId).select({ projectId: 1 }).lean()
    if (!env) return false
    const client = await OrcamentoClient.findById(session.clientId).select({ projectIds: 1, active: 1 }).lean()
    if (!client || client.active === false) return false
    return (client.projectIds ?? []).map(String).includes(String(env.projectId))
}
