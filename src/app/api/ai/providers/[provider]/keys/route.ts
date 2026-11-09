import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { createAiApiKeySchema } from "@/features/ai/api-keys"
import { createAiApiKey, keyRingProvider, listAiApiKeys } from "@/features/ai/server/api-keys"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/ai/providers/[provider]/keys — chaves de API nomeadas (sem segredo). Sessão interna; não é endpoint público. */
export const GET = withRoute<{ provider: string }>(async ({ params }) => ok(await listAiApiKeys(keyRingProvider(params.provider))))

/** POST /api/ai/providers/[provider]/keys — nova chave `{ name, secret }` (a primeira já entra ativa); devolve a lista. */
export const POST = withRoute<{ provider: string }>(async ({ req, params }) => {
    const provider = keyRingProvider(params.provider)
    const body = await parseBody(req, createAiApiKeySchema)
    if (!body.ok) return body.response
    return ok(await createAiApiKey(provider, body.data, getLocalUser().id))
})
