import { ok, validationError } from "@/lib/api/responses"
import { DomainError, withRoute } from "@/lib/api/route"
import { isUsageProviderId, usageQuerySchema } from "@/features/ai/provider-usage"
import { getProviderUsage } from "@/features/ai/server/provider-usage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/ai/providers/[provider]/usage — consumo medido de Gemini, Anthropic, OpenAI e DeepSeek
 * por recurso (feature ou agente), com `from`/`to` ISO opcionais. Sessão interna; não é endpoint
 * público por token. OpenCode e JEV têm rotas próprias, com o painel completo de cada um.
 */
export const GET = withRoute<{ provider: string }>(async ({ req, params }) => {
    if (!isUsageProviderId(params.provider)) throw new DomainError(404, "Este provedor não tem painel de consumo por esta rota", "AI_PROVIDER_NOT_FOUND")
    const parsed = usageQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
    if (!parsed.success) return validationError(parsed.error)
    return ok(await getProviderUsage(params.provider, parsed.data))
})
