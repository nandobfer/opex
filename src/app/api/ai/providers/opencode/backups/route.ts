import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { listBackups } from "@/features/opencode-resources/server/backups"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET — backups automáticos da configuração do OpenCode (no host). */
export const GET = withRoute(async () => ok(await listBackups()))
