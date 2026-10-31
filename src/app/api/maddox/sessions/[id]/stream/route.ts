import { withRoute } from "@/lib/api/route"
import { openSessionStream } from "@/features/opex-agent/server/stream"
import { MADDOX_OWNER_SCOPE } from "@/features/maddox-agent/server/sessions"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/maddox/sessions/[id]/stream — NDJSON: `snapshot` + resposta ao vivo. */
export const GET = withRoute<{ id: string }>(async ({ req, params }) => openSessionStream(params.id, req.signal, MADDOX_OWNER_SCOPE))
