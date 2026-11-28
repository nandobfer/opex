import { ok, validationError } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { directoryCheckQuerySchema } from "@/features/project-bootstrap/schemas"
import { checkBootstrapDirectory } from "@/features/project-bootstrap/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/project-bootstraps/check-directory?path=&repo= — pasta vazia/inexistente, clone do repositório ou ocupada. */
export const GET = withRoute(async ({ req }) => {
    const query = directoryCheckQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
    if (!query.success) return validationError(query.error)
    return ok(await checkBootstrapDirectory(query.data.path, query.data.repo))
})
