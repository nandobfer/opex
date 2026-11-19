import { NextResponse, type NextRequest } from "next/server"
import { isHttpsRequest } from "@/features/auth/server/cookie"
import { PLUGIN_PREVIEW_COOKIE } from "../constants"
import { togglePreviewList } from "../logic"
import { encodePreviewCookie, previewCookieOptions, previewListFromRequest } from "./preview-cookie"
import { readBundle } from "./runtime-manifest"
import type { PluginAccess } from "./service"

/** Respostas HTTP compartilhadas entre as rotas do dono e do portal (OPE-172). */

/** Liga/desliga a prévia do plugin neste navegador (cookie assinado). */
export function previewToggleResponse(req: NextRequest, pluginId: string, on: boolean): NextResponse {
    const list = togglePreviewList(previewListFromRequest(req), pluginId, on)
    const response = NextResponse.json({ success: true, data: { previewOn: list } })
    const value = encodePreviewCookie(list)
    const secure = isHttpsRequest(req.headers.get("x-forwarded-proto"), req.nextUrl.protocol)
    if (value && list.length) response.cookies.set(PLUGIN_PREVIEW_COOKIE, value, previewCookieOptions(secure))
    else response.cookies.set(PLUGIN_PREVIEW_COOKIE, "", { ...previewCookieOptions(secure), maxAge: 0 })
    return response
}

/** Bundle imutável por revisão (o hash está no nome do arquivo). */
export async function bundleResponse(access: PluginAccess, versionId: string, file: string): Promise<Response> {
    const bundle = await readBundle(access, versionId, file)
    return new Response(bundle.body, { headers: { "Content-Type": bundle.contentType, "Cache-Control": "private, max-age=31536000, immutable" } })
}
