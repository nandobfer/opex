import { created, ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { createColumnSchema } from "@/features/tasks/schemas"
import { createColumn, getBoard } from "@/features/tasks/server/columns"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/tasks/columns — colunas customizadas e a ordem do quadro. */
export const GET = withRoute(async () => ok(await getBoard()))

/** POST /api/tasks/columns — cria coluna customizada (status pessoal). */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, createColumnSchema)
    if (!body.ok) return body.response
    return created(await createColumn(body.data, getLocalUser().id))
})
