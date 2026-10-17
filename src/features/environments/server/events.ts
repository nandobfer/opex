import { publishToChannels } from "@/lib/pusher/channels"
import { OrcamentoClient } from "@/lib/db/models/Orcamento"

/** Só notificações: dados/logs são recuperados por HTTP com vínculo revalidado. */
export async function publishEnvironment(projectId: string, environmentId?: string): Promise<void> {
    const clients = await OrcamentoClient.find({ projectIds: projectId, active: { $ne: false } })
        .select({ _id: 1 })
        .lean()
    const channels = ["private-app", ...clients.map((c) => `private-client-${c._id}`)]
    if (environmentId) channels.push(`private-environment-${environmentId}`)
    await publishToChannels(channels, "environments-updated", {
        projectId,
        ...(environmentId ? { environmentId } : {}),
    })
}
