import { NextResponse, type NextRequest } from "next/server"
import { BASE_PATH } from "@/lib/base-path"
import { DomainError } from "@/lib/api/route"
import { requireAdminSession } from "@/features/auth/server/context"
import { getClient } from "@/features/orcamentos/server/clients"
import { clienteDashboardPath, PREVIEW_CLIENT_COOKIE } from "@/features/orcamentos/constants"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/auth/preview-client?clientId=… — o **dono** entra na pré-visualização do portal de um
 * cliente: grava o cookie `opex_preview_client` e redireciona para `/cliente/dashboard`. Restrito à
 * sessão do dono.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    const url = `${BASE_PATH}${clienteDashboardPath()}`
    try {
        await requireAdminSession(request)
        const clientId = request.nextUrl.searchParams.get("clientId")
        if (!clientId) throw new DomainError(400, "Informe o cliente.", "CLIENT_NOT_SELECTED")
        await getClient(clientId)
    } catch {
        return NextResponse.redirect(new URL(`${BASE_PATH}/login`, request.url))
    }

    const response = NextResponse.redirect(new URL(url, request.url))
    response.cookies.set({ name: PREVIEW_CLIENT_COOKIE, value: request.nextUrl.searchParams.get("clientId")!, httpOnly: true, sameSite: "lax", path: "/" })
    return response
}
