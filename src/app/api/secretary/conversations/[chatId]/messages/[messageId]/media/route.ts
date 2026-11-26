import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { mediaResponseHeaders } from "@/features/evolution-api/chat-media-rules"
import { inboxMedia } from "@/features/secretary-agent/server/inbox"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET — binário de uma foto, vídeo, áudio ou documento da conversa (aba Conversas, OPE-197). O tipo é do remetente:
 * só imagem/vídeo/áudio saem inline; o resto vira download, sempre com `nosniff` e CSP `sandbox`.
 */
export const GET = withRoute<{ chatId: string; messageId: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    const media = await inboxMedia(params.chatId, params.messageId)
    return new Response(new Uint8Array(media.bytes), { status: 200, headers: mediaResponseHeaders(media.mimetype, media.fileName, media.bytes.length) })
})
