import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { aiApiKeySelectionSchema } from "@/features/ai/api-keys"
import { keyRingProvider, setAiApiKeySelected } from "@/features/ai/server/api-keys"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** PATCH /api/ai/providers/[provider]/keys/[keyId]/selection — põe (`selected: true`) ou tira a chave do rodízio (a principal não sai: 409 `AI_API_KEY_PRIMARY`). */
export const PATCH = withRoute<{ provider: string; keyId: string }>(async ({ req, params }) => {
    const provider = keyRingProvider(params.provider)
    const body = await parseBody(req, aiApiKeySelectionSchema)
    if (!body.ok) return body.response
    return ok(await setAiApiKeySelected(provider, params.keyId, body.data, getLocalUser().id))
})
