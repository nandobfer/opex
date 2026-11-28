import { created, ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { projectBootstrapStartSchema } from "@/features/project-bootstrap/schemas"
import { listProjectBootstraps, startProjectBootstrap } from "@/features/project-bootstrap/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/project-bootstraps — histórico (`?active=1`: só os em andamento, aguardando ou com falha). */
export const GET = withRoute(async ({ req }) => ok(await listProjectBootstraps({ active: req.nextUrl.searchParams.get("active") === "1" })))

/** POST /api/project-bootstraps — envia a etapa 1 e começa o provisionamento pelo Agente de Bootstrap. */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, projectBootstrapStartSchema)
    if (!body.ok) return body.response
    return created(await startProjectBootstrap(body.data, getLocalUser().id))
})
