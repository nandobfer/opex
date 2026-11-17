import { ok, validationError } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { usageQuerySchema } from "@/features/ai/provider-usage"
import { refreshOpencodeGoUsage } from "@/features/opencode-quota/server/go-usage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/opencode/quota/go/refresh — relê o status e o dia de hoje (botão Atualizar; mínimo de 30 s por chave). */
export const POST = withRoute(async ({ req }) => {
    const parsed = usageQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
    if (!parsed.success) return validationError(parsed.error)
    return ok(await refreshOpencodeGoUsage(parsed.data))
})
