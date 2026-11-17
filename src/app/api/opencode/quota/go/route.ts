import { ok, validationError } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { usageQuerySchema } from "@/features/ai/provider-usage"
import { getOpencodeGoUsage } from "@/features/opencode-quota/server/go-usage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/opencode/quota/go — consumo da assinatura OpenCode Go (Console), com `from`/`to` ISO e o filtro
 * `apiKey` da aba Consumo. Sessão do dono; não é endpoint público por token.
 */
export const GET = withRoute(async ({ req }) => {
    const parsed = usageQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
    if (!parsed.success) return validationError(parsed.error)
    return ok(await getOpencodeGoUsage(parsed.data))
})
