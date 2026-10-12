import { NextResponse, type NextRequest } from "next/server"
import { getPusherServer } from "@/lib/pusher/server"
import { isChannelAuthorized } from "@/lib/pusher/channel-auth"
import { sessionFromRequest } from "@/features/auth/server/context"
import { logger } from "@/lib/logger"

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
        if (!isChannelAuthorized(channel, session)) return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
        return NextResponse.json(pusher.authorizeChannel(socketId, channel))
    } catch (error) {
        logger.error({ err: error, channel }, "[pusher] Erro ao autorizar canal")
        return NextResponse.json({ error: "Erro ao verificar acesso" }, { status: 500 })
    }
}
