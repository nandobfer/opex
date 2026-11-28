import { ok, validationError } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { repoCheckQuerySchema } from "@/features/project-bootstrap/schemas"
import { checkBootstrapRepo } from "@/features/project-bootstrap/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/project-bootstraps/check-repo?owner=&name=&visibility= — nome inválido, livre, existente, já vinculado ou sem permissão. */
export const GET = withRoute(async ({ req }) => {
    const query = repoCheckQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
    if (!query.success) return validationError(query.error)
    return ok(await checkBootstrapRepo(query.data.owner, query.data.name, query.data.visibility))
})
