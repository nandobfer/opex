import type { NextRequest } from "next/server"
import { ok } from "@/lib/api/responses"
import { DomainError, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { requireAdminSession } from "@/features/auth/server/context"
import { matchEngramindRoute, normalizeEngramindQuery } from "@/features/engramind/operations"
import { runEngramindOperation } from "@/features/engramind/server/operations-runner"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Proxy administrativo do Engramind (só o dono): `/api/engramind/<recurso>` → operação do catálogo
 * (`src/features/engramind/operations.ts`), validada por Zod e executada pelo serviço. O navegador
 * nunca chama o Engramind direto.
 */
const decode = (segment: string) => {
    try {
        return decodeURIComponent(segment)
    } catch {
        return segment
    }
}

async function bodyOf(req: NextRequest): Promise<Record<string, unknown>> {
    const text = await req.text()
    if (!text.trim()) return {}
    try {
        const parsed: unknown = JSON.parse(text)
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    } catch {
        // cai no erro abaixo
    }
    throw new DomainError(400, "Corpo da requisição inválido", "INVALID_JSON")
}

const handler = withRoute<Record<string, string>>(async ({ req, params }) => {
    await requireAdminSession(req)
    const match = matchEngramindRoute(req.method, ((params as unknown as { path?: string[] }).path ?? []).map(decode))
    if (!match) throw new DomainError(404, "Operação do Engramind não encontrada", "ENGRAMIND_ROUTE_NOT_FOUND")
    const query = normalizeEngramindQuery(Object.fromEntries(req.nextUrl.searchParams.entries()))
    const body = req.method === "GET" || req.method === "DELETE" ? {} : await bodyOf(req)
    return ok(await runEngramindOperation(match.operation.id, { ...query, ...body, ...match.params }, getLocalUser().id))
})

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
