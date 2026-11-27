import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { aiKeyBillingSchema } from "@/features/ai-billing/schemas"
import { keyRingProvider, updateAiKeyBilling } from "@/features/ai/server/api-keys"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** PATCH /api/ai/providers/[provider]/keys/[keyId]/billing — plano de cobrança da chave (Pago por uso, Assinatura ou Créditos; OPE-203). */
export const PATCH = withRoute<{ provider: string; keyId: string }>(async ({ req, params }) => {
    const provider = keyRingProvider(params.provider)
    const body = await parseBody(req, aiKeyBillingSchema)
    if (!body.ok) return body.response
    return ok(await updateAiKeyBilling(provider, params.keyId, body.data, getLocalUser().id))
})
