import { integrationDebugChannel } from "@/lib/integrations/catalog"
import { appChannel, publishToChannels } from "@/lib/pusher/channels"
import { TASKS_UPDATED_EVENT } from "@/features/tasks/constants"
import { GITHUB_UPDATED_EVENT, type GithubUpdateScope } from "../constants"

/** Telas da integração (abas) recarregam o escopo indicado. */
export async function publishGithubUpdated(scope: GithubUpdateScope): Promise<void> {
    await publishToChannels([integrationDebugChannel("github")], GITHUB_UPDATED_EVENT, { scope })
}

/** Quadro de Tarefas recarrega (rascunhos usam ids `draft-…`). */
export async function publishBoardUpdated(ids: string[]): Promise<void> {
    if (ids.length) await publishToChannels([appChannel()], TASKS_UPDATED_EVENT, { ids: ids.slice(0, 200) })
}
