import { ok, validationError } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { usageQuerySchema } from "@/features/ai/provider-usage"
import { refreshCommandCodeUsage } from "@/features/command-code-usage/server/usage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/command-code/usage/refresh — relê a conta e o dia de hoje (botão Atualizar; mínimo de 30 s por chave). */
export const POST = withRoute(async ({ req }) => {
    const parsed = usageQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
    if (!parsed.success) return validationError(parsed.error)
    return ok(await refreshCommandCodeUsage(parsed.data))
})
