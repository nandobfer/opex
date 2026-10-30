import { ok } from "@/lib/api/responses"
import { parseBody, withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { sshTrustSchema } from "@/features/opencode-service/schemas"
import { readHostFingerprint, trustHostKey } from "@/features/opencode-service/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET — impressão digital que o host SSH apresenta agora (e a confiada). */
export const GET = withRoute(async () => ok(await readHostFingerprint()))

/** POST { fingerprint } — confia na chave do host (precisa ser a apresentada agora). */
export const POST = withRoute(async ({ req }) => {
    const body = await parseBody(req, sshTrustSchema)
    if (!body.ok) return body.response
    return ok(await trustHostKey(body.data.fingerprint, { id: getLocalUser().id, origin: "ui" }))
})
