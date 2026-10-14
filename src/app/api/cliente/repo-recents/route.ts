import { parseBody, withRoute } from "@/lib/api/route"
import { ok } from "@/lib/api/responses"
import { requireClientActor } from "@/features/auth/server/context"
import { clientProjects } from "@/features/orcamentos/server/clients"
import type { ClienteOrcamentoDoc } from "@/features/orcamentos/server/token"
import { recordRepoRecentSchema } from "@/features/repository-recency/schemas"
import { getRepoRecents, recordRepoRecent } from "@/features/repository-recency/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Ids dos repositórios permitidos ao **cliente em escopo** (o seletor do portal mostra só esses). */
async function allowedProjectIds(client: ClienteOrcamentoDoc): Promise<Set<string>> {
    const projects = await clientProjects(client)
    return new Set(projects.map((project) => project.id))
}

/** GET /api/cliente/repo-recents — repositórios usados recentemente pelo usuário no portal. */
export const GET = withRoute(async ({ req }) => {
    const actor = await requireClientActor(req)
    return ok(await getRepoRecents(actor.userId, await allowedProjectIds(actor.client)))
})

/** POST /api/cliente/repo-recents — registra o uso de um repositório (`{ projectId }`). */
export const POST = withRoute(async ({ req }) => {
    const actor = await requireClientActor(req)
    const body = await parseBody(req, recordRepoRecentSchema)
    if (!body.ok) return body.response
    return ok(await recordRepoRecent(actor.userId, body.data.projectId, await allowedProjectIds(actor.client)))
})
