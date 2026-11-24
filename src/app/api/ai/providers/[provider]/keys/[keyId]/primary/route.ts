import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { keyRingProvider, makePrimaryAiApiKey } from "@/features/ai/server/api-keys"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/ai/providers/[provider]/keys/[keyId]/primary — torna esta a chave principal do provedor (e a põe em uso). */
export const POST = withRoute<{ provider: string; keyId: string }>(async ({ params }) =>
    ok(await makePrimaryAiApiKey(keyRingProvider(params.provider), params.keyId, getLocalUser().id)),
)
