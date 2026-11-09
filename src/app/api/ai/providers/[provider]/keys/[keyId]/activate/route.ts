import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { activateAiApiKey, keyRingProvider } from "@/features/ai/server/api-keys"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/ai/providers/[provider]/keys/[keyId]/activate — passa a usar esta chave no provedor. */
export const POST = withRoute<{ provider: string; keyId: string }>(async ({ params }) =>
    ok(await activateAiApiKey(keyRingProvider(params.provider), params.keyId, getLocalUser().id)),
)
