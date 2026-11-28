import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { projectBootstrapEnvironmentSchema } from "@/features/project-bootstrap/schemas"
import { setProjectBootstrapEnvironment } from "@/features/project-bootstrap/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/project-bootstraps/[id]/environment — liga ou desliga o ambiente e deploy de um bootstrap aberto. */
export const POST = withRoute<{ id: string }>(async ({ req, params }) => {
    const body = await parseBody(req, projectBootstrapEnvironmentSchema)
    if (!body.ok) return body.response
    return ok(await setProjectBootstrapEnvironment(params.id, body.data.enabled, getLocalUser().id))
})
