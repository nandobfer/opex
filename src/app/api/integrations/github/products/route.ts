import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { listProductOptions } from "@/features/github/server/lookups"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** GET /api/integrations/github/products — produtos do Go! Sipal com o repositório sugerido e o já vinculado. */
export const GET = withRoute(async () => ok(await listProductOptions()))
