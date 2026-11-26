import { withRoute } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { inboxMedia } from "@/features/secretary-agent/server/inbox"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET — binário de uma foto, vídeo, áudio ou documento da conversa (aba Conversas, OPE-197). */
export const GET = withRoute<{ chatId: string; messageId: string }>(async ({ req, params }) => {
    await requireAdminSession(req)
    const media = await inboxMedia(params.chatId, params.messageId)
    const headers: Record<string, string> = { "content-type": media.mimetype, "cache-control": "private, max-age=86400", "content-length": String(media.bytes.length) }
    if (media.fileName) headers["content-disposition"] = `inline; filename*=UTF-8''${encodeURIComponent(media.fileName)}`
    return new Response(new Uint8Array(media.bytes), { status: 200, headers })
})
