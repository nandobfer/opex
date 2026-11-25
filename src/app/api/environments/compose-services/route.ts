import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { composeServicesInputSchema } from "@/features/environments/schemas"
import { readComposeServices } from "@/features/environments/server/compose-read"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/environments/compose-services — "Ler compose" do formulário: serviços e limites declarados (só o dono). */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, composeServicesInputSchema)
    if (!body.ok) return body.response
    return ok(await readComposeServices(body.data.source))
})
