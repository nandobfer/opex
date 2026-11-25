import type { NextRequest } from "next/server"
import { runAfterResponse } from "@/lib/after-response"
import { EVOLUTION_WEBHOOK_SECRET_HEADER } from "@/features/evolution-api/constants"
import { authenticateEvolutionWebhook, processEvolutionEvent } from "@/features/evolution-api/server/webhook"
import { evolutionLog } from "@/features/evolution-api/server/shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/evolution/webhook — eventos da Evolution API. Fora do login (`PUBLIC_ROUTES`) e autenticado
 * SÓ pelo header `x-opex-webhook-secret`; responde 204 na hora e processa depois.
 */
export async function POST(req: NextRequest): Promise<Response> {
    const raw = await req.text()
    let auth: Awaited<ReturnType<typeof authenticateEvolutionWebhook>>
    try {
        auth = await authenticateEvolutionWebhook(raw, req.headers.get(EVOLUTION_WEBHOOK_SECRET_HEADER))
    } catch (error) {
        evolutionLog.warn({ err: error }, "[evolution] webhook não pôde ser validado")
        return new Response(null, { status: 401 })
    }
    if (!auth.ok) {
        evolutionLog.warn({ reason: auth.reason }, "[evolution] webhook recusado")
        return new Response(null, { status: auth.status })
    }
    const body = auth.body
    runAfterResponse("evolution-webhook", () => processEvolutionEvent(body))
    return new Response(null, { status: 204 })
}
