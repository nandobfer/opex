import { NextResponse, type NextRequest } from "next/server"
import { publicOriginOf } from "@/lib/api/public-origin"
import { DomainError } from "@/lib/api/route"
import { loggerFor } from "@/lib/logger"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { OPEX_MCP_SECTION_PATH } from "@/features/opex-agent/mcp"
import { finishMcpOauth } from "@/features/opex-agent/server/mcp/oauth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/opex/mcp-servers/oauth/callback — retorno do provedor OAuth de um MCP do Agente Opex.
 * Exige a sessão do dono (o cookie `lax` acompanha a navegação de volta) e o `state` do pedido; troca
 * o código pelo token e volta para a seção MCPs na origem pública do pedido.
 */
export async function GET(req: NextRequest) {
    const fallback = (status: string, message?: string) => {
        const url = new URL(OPEX_MCP_SECTION_PATH, publicOriginOf(req.headers, req.url))
        url.searchParams.set("oauth", status)
        if (message) url.searchParams.set("mensagem", message.slice(0, 300))
        return NextResponse.redirect(url, 303)
    }
    try {
        await requireAdminSession(req)
        const query = req.nextUrl.searchParams
        const result = await finishMcpOauth(
            { state: query.get("state"), code: query.get("code"), error: query.get("error"), errorDescription: query.get("error_description"), iss: query.get("iss") },
            getLocalUser().id,
        )
        if (!result.redirectTo) return fallback(result.ok ? "ok" : "erro", result.ok ? undefined : result.message)
        const url = new URL(result.redirectTo)
        if (!result.ok) url.searchParams.set("mensagem", result.message.slice(0, 300))
        return NextResponse.redirect(url, 303)
    } catch (error) {
        if (error instanceof DomainError) return fallback("erro", error.message)
        loggerFor({ module: "opex-agent-mcp" }).error({ err: error }, "[opex-mcp] falha no retorno do OAuth")
        return fallback("erro", "Erro interno ao concluir a autorização. Tente novamente.")
    }
}
