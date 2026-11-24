import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { readEnvValues } from "@/features/environments/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/environments/[id]/env — valores das variáveis extras para o formulário Editar (só o dono). */
export const GET = withRoute<{ id: string }>(async ({ params }) => {
    return ok(await readEnvValues(params.id))
})
