import { NextResponse, type NextRequest } from "next/server"
import { getPusherServer } from "@/lib/pusher/server"
import { isChannelAuthorized, parseChannel } from "@/lib/pusher/channel-auth"
import { sessionFromRequest } from "@/features/auth/server/context"
import { logger } from "@/lib/logger"
import { DomainError } from "@/lib/api/route"

/**
 * POST /api/pusher/auth — autoriza assinaturas de canais privados.
 * O Pusher envia `socket_id` e `channel_name` como `application/x-www-form-urlencoded`.
 * Regras (por tipo de sessão) em `src/lib/pusher/channel-auth.ts`.
 */
export async function POST(request: NextRequest) {
    const params = new URLSearchParams(await request.text())
    const socketId = params.get("socket_id")
    const channel = params.get("channel_name")
    if (!socketId || !channel) return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 })

    let pusher: Awaited<ReturnType<typeof getPusherServer>>
    try {
        pusher = await getPusherServer()
    } catch {
        return NextResponse.json({ error: "Pusher não configurado" }, { status: 503 })
    }

    try {
        const session = await sessionFromRequest(request)
        const parsed = parseChannel(channel)
        if (parsed.kind === "environment") {
            const { environmentActor } = await import("@/features/environments/server/access")
            const { Environment } = await import("@/lib/db/models/Environment")
            const { dbConnect } = await import("@/lib/db")
            const { assertProjectAccess } = await import("@/features/environments/server/access")
            const actor = await environmentActor(request, session?.kind === "client")
            await dbConnect()
            const env = await Environment.findById(parsed.environmentId).lean()
            if (!env) return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
            assertProjectAccess(actor, env.projectId)
        } else if (!isChannelAuthorized(channel, session)) return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
        return NextResponse.json(pusher.authorizeChannel(socketId, channel))
    } catch (error) {
        if (error instanceof DomainError) return NextResponse.json({ error: "Acesso negado" }, { status: error.status === 404 ? 403 : error.status })
        logger.error({ err: error, channel }, "[pusher] Erro ao autorizar canal")
        return NextResponse.json({ error: "Erro ao verificar acesso" }, { status: 500 })
    }
}
