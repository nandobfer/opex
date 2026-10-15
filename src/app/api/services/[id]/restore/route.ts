import { ok } from "@/lib/api/responses"
import { withRoute } from "@/lib/api/route"
import { getLocalUser } from "@/lib/local-user"
import { setServiceArchived } from "@/features/services/server/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** POST /api/services/[id]/restore — desarquiva o serviço (volta às somas/listas/dashboard/portal). */
export const POST = withRoute<{ id: string }>(async ({ params }) => ok(await setServiceArchived(params.id, false, getLocalUser().id)))
