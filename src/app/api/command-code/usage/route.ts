import { ok, validationError } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { usageQuerySchema } from "@/features/ai/provider-usage"
import { getCommandCodeUsage } from "@/features/command-code-usage/server/usage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/command-code/usage — consumo da assinatura Command Code (API da CLI), com `from`/`to` ISO e o filtro
 * `apiKey` da aba Consumo. Sessão do dono; não é endpoint público por token.
 */
export const GET = withRoute(async ({ req }) => {
    const parsed = usageQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
    if (!parsed.success) return validationError(parsed.error)
    return ok(await getCommandCodeUsage(parsed.data))
})
