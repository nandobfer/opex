import { dbConnect } from "@/lib/db"
import { Project } from "@/lib/db/models/Project"
import { LOCAL_USER_ID } from "@/lib/local-user"
import { parseBody, withRoute } from "@/lib/api/route"
import { ok } from "@/lib/api/responses"
import { requireAdminSession } from "@/features/auth/server/context"
import { recordRepoRecentSchema } from "@/features/repository-recency/schemas"
import { getRepoRecents, recordRepoRecent } from "@/features/repository-recency/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Ids de todos os repositórios vinculados — o dono tem acesso a todos. */
async function ownerProjectIds(): Promise<Set<string>> {
    await dbConnect()
    const docs = await Project.find({}, { _id: 1 }).lean()
    return new Set(docs.map((doc) => String(doc._id)))
}

/** GET /api/tasks/repo-recents — repositórios usados recentemente pelo dono. */
export const GET = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    return ok(await getRepoRecents(LOCAL_USER_ID, await ownerProjectIds()))
})

/** POST /api/tasks/repo-recents — registra o uso de um repositório (`{ projectId }`). */
export const POST = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const body = await parseBody(req, recordRepoRecentSchema)
    if (!body.ok) return body.response
    return ok(await recordRepoRecent(LOCAL_USER_ID, body.data.projectId, await ownerProjectIds()))
})
