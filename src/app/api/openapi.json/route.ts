import { NextResponse } from "next/server"
import { buildPublicApiSpec } from "@/features/public-api/openapi/spec"
import { loggerFor } from "@/lib/logger"
import type { MaddoxMcpDocsCatalog } from "@/features/maddox-agent/server/mcp-catalog"

/**
 * GET /api/openapi.json — especificação OpenAPI 3.1 da API interna.
 *
 * Pública (sem token): expõe só o contrato, nenhum dado nem segredo. É a `swaggerUrl` gerenciada
 * da integração API interna em Integrações. Inclui o MCP do Agente Maddox — de propósito (decisão do
 * dono no plano da OPE-101): o catálogo de ferramentas do dono e do portal (nomes, descrições e
 * esquemas de entrada) fica visível a quem tiver a URL; chamá-las exige o segredo do MCP, que não sai
 * do servidor, e uma sessão do Maddox existente. O CORS aberto vale para o documento inteiro (o
 * contrato é o mesmo para qualquer origem). O catálogo entra por
 * import dinâmico e a rota é dinâmica, para o registro de ferramentas (que importa serviços pesados)
 * não entrar no grafo estático nem rodar no `next build`.
 */
export const dynamic = "force-dynamic"

const log = loggerFor({ module: "public-api" })

export async function GET() {
    let maddoxTools: MaddoxMcpDocsCatalog | undefined
    try {
        const { maddoxMcpDocsCatalog } = await import("@/features/maddox-agent/server/mcp-catalog")
        maddoxTools = await maddoxMcpDocsCatalog()
    } catch (error) {
        log.warn({ err: error instanceof Error ? error.message : error }, "[openapi] catálogo do MCP do Agente Maddox indisponível; especificação sem o MCP")
    }
    return NextResponse.json(buildPublicApiSpec({ maddoxTools }), {
        headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
    })
}
