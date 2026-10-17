import { z } from "zod"
import { parseBody, withRoute } from "@/lib/api/route"
import { ok } from "@/lib/api/responses"
import { consumeAccessToken } from "@/features/environments/server/credentials"
import { consumeAccessProbe } from "@/features/environments/server/access-probe"

const accessSchema = z.union([
    z.object({ id: z.string().min(8).max(200), token: z.string().min(20).max(200) }).strict(),
    z.object({ probe: z.string().min(20).max(200) }).strict(),
])

/**
 * Entrega o acesso temporário ao agente do OpenCode. Sem sessão: a autenticação é o **token de uso
 * único** da operação (ou do teste de acesso), registrado somente em memória. O agente roda em outro
 * filesystem que o servidor, então é ele que cria o diretório protegido e materializa os arquivos.
 * Resposta `no-store`, nunca registrada em log e utilizável uma única vez.
 */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, accessSchema)
    if (!body.ok) return body.response
    const data = "probe" in body.data
        ? consumeAccessProbe(body.data.probe)
        : await consumeAccessToken(body.data.id, body.data.token)
    return ok(data, { headers: { "Cache-Control": "no-store" } })
})
