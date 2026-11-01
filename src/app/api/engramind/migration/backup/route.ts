import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { downloadBackup, generateBackup } from "@/features/engramind/server/migration"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/engramind/migration/backup — gera o backup da coleção antiga (sem alterá-la). */
export const POST = withRoute(async () => ok(await generateBackup(getLocalUser().id)))

/** GET — baixa o snapshot JSON (com o hash e o id do Engramind das importadas). */
export const GET = withRoute(async () => {
    const file = await downloadBackup()
    return new Response(file.body, { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${file.filename}"` } })
})
