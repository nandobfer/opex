import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { ensureAgentMemoryNetwork } from "@/features/engramind/server/memory-network"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/engramind/migration/provision — "Conferir canais e agentes" (passo Memórias dos agentes). */
export const POST = withRoute(async () => ok((await ensureAgentMemoryNetwork(getLocalUser().id)).step))
