import type { NextRequest } from "next/server"
import { runAfterResponse } from "@/lib/after-response"
import { authenticateWebhook, processWebhookEvent } from "@/features/engramind/server/webhook"
import { engramindLog } from "@/features/engramind/server/shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/engramind/webhook — eventos do Engramind. Fora do login (`PUBLIC_ROUTES`) e autenticado
 * SÓ pela assinatura `Engramind-Signature`; responde rápido e repassa às telas depois.
 */
export async function POST(req: NextRequest): Promise<Response> {
    const raw = await req.text()
    let auth: Awaited<ReturnType<typeof authenticateWebhook>>
    try {
        auth = await authenticateWebhook(raw, req.headers.get("engramind-signature"))
    } catch (error) {
        engramindLog.warn({ err: error }, "[engramind] webhook não pôde ser validado")
        return new Response(null, { status: 401 })
    }
    if (!auth.ok) {
        engramindLog.warn({ reason: auth.reason }, "[engramind] webhook recusado")
        return new Response(null, { status: 401 })
    }
    const event = auth.event
    runAfterResponse("engramind-webhook", () => processWebhookEvent(event))
    return new Response(null, { status: 204 })
}
