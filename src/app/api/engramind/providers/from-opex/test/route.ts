import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { testAiSourceSchema } from "@/features/engramind/schemas/ai-source"
import { testOpexAiSource } from "@/features/engramind/server/ai-source"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/engramind/providers/from-opex/test — testa a proposta com a chave do Opex, sem gravar nada. */
export const POST = withRoute(async ({ req }) => {
    await requireAdminSession(req)
    const parsed = await parseBody(req, testAiSourceSchema)
    if (!parsed.ok) return parsed.response
    return ok(await testOpexAiSource(parsed.data))
})
