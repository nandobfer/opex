import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { updateAiApiKeySchema } from "@/features/ai/api-keys"
import { removeAiApiKey, updateAiApiKey, keyRingProvider } from "@/features/ai/server/api-keys"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** PATCH /api/ai/providers/[provider]/keys/[keyId] — renomeia (`name`) e/ou substitui o segredo (`secret`). */
export const PATCH = withRoute<{ provider: string; keyId: string }>(async ({ req, params }) => {
    const provider = keyRingProvider(params.provider)
    const body = await parseBody(req, updateAiApiKeySchema)
    if (!body.ok) return body.response
    return ok(await updateAiApiKey(provider, params.keyId, body.data, getLocalUser().id))
})

/** DELETE /api/ai/providers/[provider]/keys/[keyId] — remove a chave (a ativa só quando é a única: 409 `AI_API_KEY_ACTIVE`). */
export const DELETE = withRoute<{ provider: string; keyId: string }>(async ({ params }) =>
    ok(await removeAiApiKey(keyRingProvider(params.provider), params.keyId, getLocalUser().id)),
)
