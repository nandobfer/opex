import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { restoreBackup } from "@/features/opencode-resources/server/backups"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST — restaura o backup (faz antes um backup do estado atual). */
export const POST = withRoute<{ id: string }>(async ({ params }) => ok(await restoreBackup(params.id, { id: getLocalUser().id, origin: "ui" })))
