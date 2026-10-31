import { ok } from "@/lib/api/responses"
import { DomainError, withRoute } from "@/lib/api/route"
import { AI_MODEL_KINDS, listAiModels, supportsEmbeddingModels, type AiModelKind } from "@/lib/ai/catalog"
import { AiProviderError } from "@/lib/ai/errors"
import { isAiProviderId } from "@/lib/ai/providers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const isKind = (value: string): value is AiModelKind => (AI_MODEL_KINDS as readonly string[]).includes(value)

/**
 * GET /api/ai/providers/[provider]/models — modelos disponíveis (`?refresh=1` ignora o cache;
 * `?kind=embedding` lista os de embedding, só no Gemini e na OpenAI).
 */
export const GET = withRoute<{ provider: string }>(async ({ req, params }) => {
    if (!isAiProviderId(params.provider)) throw new DomainError(404, "Provedor de IA não encontrado", "AI_PROVIDER_NOT_FOUND")
    const kind = req.nextUrl.searchParams.get("kind") ?? "chat"
    if (!isKind(kind)) throw new DomainError(422, "Tipo de modelo inválido (use chat ou embedding)", "AI_MODEL_KIND_INVALID")
    if (kind === "embedding" && !supportsEmbeddingModels(params.provider)) throw new DomainError(422, "Este provedor não lista modelos de embedding", "AI_EMBEDDING_UNSUPPORTED")
    try {
        return ok(await listAiModels(params.provider, { fresh: req.nextUrl.searchParams.get("refresh") === "1", signal: req.signal, kind }))
    } catch (error) {
        if (error instanceof AiProviderError) throw new DomainError(502, error.message, "AI_PROVIDER_ERROR")
        throw error
    }
})
